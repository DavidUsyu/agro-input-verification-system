import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { VerificationService } from '../verification/verification.service';
import { parseVerification } from '../verification/validation';
import { ReportsService } from '../reports/reports.service';
import { submission } from '../reports/validation';
import { countyNames } from '../location/county-location';
import type { SessionUser } from '../auth/auth.types';
import { UssdAccountsService } from './ussd-accounts.service';
import { callbackInput } from './validation';
import { accountMenu, compact, concernReasons, countyMatches, countyMenu, countyPrompt, home, reasonMenu, resultMessage, resumeMenu } from './menus';
import { findDraft, finishDraft, saveDraft, startDraft, type State } from './report-drafts';
interface Session { state: State; depth: number; text_digest: string; response: string; phone_digest: string; service_code: string; closed: boolean; expired: boolean }

@Injectable()
export class UssdService {
  private readonly localKey = randomBytes(32).toString('hex');
  constructor(private readonly database: DatabaseService, private readonly config: ConfigService,
    private readonly accounts: UssdAccountsService, private readonly verification: VerificationService,
    private readonly reports: ReportsService) {}

  private digest(value: string) {
    return createHmac('sha256', this.config.get<string>('USSD_CALLBACK_TOKEN') || this.localKey).update(value).digest('hex');
  }

  async callback(body: unknown) {
    const input = callbackInput(body);
    const digest = this.digest(input.text); const phoneDigest = this.digest(input.phone);
    return this.database.transaction(async client => {
      if (!input.parts.length) {
        await client.query("DELETE FROM ussd_sessions WHERE id IN (SELECT id FROM ussd_sessions WHERE expires_at<CURRENT_TIMESTAMP-interval '1 day' ORDER BY expires_at LIMIT 500)");
        await client.query(`DELETE FROM ussd_report_drafts WHERE farmer_id IN
          (SELECT farmer_id FROM ussd_report_drafts WHERE expires_at<CURRENT_TIMESTAMP ORDER BY expires_at LIMIT 500 FOR UPDATE SKIP LOCKED)`);
        await client.query(`INSERT INTO ussd_sessions(id,phone_digest,service_code,state,text_digest,response)
          VALUES ($1,$2,$3,'{"step":"home"}',$4,$5) ON CONFLICT(id) DO NOTHING`, [input.sessionId,phoneDigest,input.serviceCode,digest,home]);
      }
      const row = (await client.query<Session>('SELECT *,expires_at<=CURRENT_TIMESTAMP AS expired FROM ussd_sessions WHERE id=$1 FOR UPDATE', [input.sessionId])).rows[0];
      if (!row || row.expired) return 'END Session expired. Dial again.';
      if (row.phone_digest !== phoneDigest || row.service_code !== input.serviceCode) return 'END Invalid session. Dial again.';
      // Revalidate credentials even for duplicate requests, so revoked sessions cannot replay private responses.
      let user: SessionUser | undefined;
      if (row.state.farmerId) {
        user = await this.accounts.current(client,row.state.farmerId,row.state.version!,input.phone);
        if (!user) return 'END Account access ended. Dial again.';
      }
      if (row.text_digest === digest) return row.response;
      if (row.closed || input.parts.length !== row.depth+1 || this.digest(input.parts.slice(0,-1).join('*')) !== row.text_digest) return 'END Session out of order. Dial again.';
      let response: string | undefined;
      // Sessions already open during an upgrade can adopt the draft flow without losing their answers.
      if (row.state.step?.startsWith('report_') && row.state.step!=='report_resume' && !row.state.draftId) {
        const existing=await findDraft(client,row.state.farmerId!);
        if (existing && !existing.expired && existing.status==='active') response='END A saved report is available. Dial again and sign in to continue.';
        else {
          const step=row.state.step==='report_seller' && !row.state.county ? 'report_county' : row.state.step;
          await startDraft(client,row.state,step);
        }
      }
      if (row.state.draftId && row.state.step!=='report_resume') {
        const draft=await findDraft(client,row.state.farmerId!);
        if (!draft || draft.expired) response='END Saved report expired. Dial again to start a new report.';
        else if (draft.id!==row.state.draftId) response='END Report draft changed. Dial again to continue.';
        else if (draft.status==='submitted') response=`END Report #${draft.report_id} already submitted. Check My reports.`;
        else if (draft.status==='discarded') response='END Report cancelled. Nothing submitted.';
        else if (draft.revision!==row.state.draftRevision) response='END Report draft changed. Dial again to continue.';
      }
      if (!response) {
        response=await this.advance(client,row.state,input.parts.at(-1)!.trim(),input.phone,user);
        if (row.state.draftId && row.state.step!=='report_resume') await saveDraft(client,row.state);
      }
      if (response.length > 160) throw new Error('USSD screen exceeded its character budget.');
      const closed = response.startsWith('END ');
      await client.query(`UPDATE ussd_sessions SET state=$2,farmer_id=$3,depth=$4,text_digest=$5,response=$6,closed=$7 WHERE id=$1`,
        [input.sessionId,closed ? {farmerId:row.state.farmerId,version:row.state.version} : row.state,row.state.farmerId ?? null,input.parts.length,digest,response,closed]);
      return response;
    });
  }

  private prompt(state: State): string {
    switch(state.step) {
      case 'report_code': return 'CON Enter package code, or 9 for no code.\nProgress saved for 24 hours.\n0 Save & exit';
      case 'report_name': return 'CON Enter product name (2-80 characters).\n0 Save & exit';
      case 'report_category': return 'CON Product type\n1 Seed\n2 Fertilizer\n0 Save & exit';
      case 'report_reason': return reasonMenu.replace('Choose concern',compact(state.productName,30) || 'Choose concern').replace('0 Exit','0 Save & exit');
      case 'report_description': return 'CON Describe the concern in 10-80 characters.\n0 Save & exit';
      case 'report_county': case 'verify_county': return state.countyChoices
        ? countyMenu(state.countyPage ?? 0,state.countyChoices,state.step==='report_county') : countyPrompt(state.step==='report_county');
      case 'report_seller': return 'CON Enter shop or market location, or 9 to skip.\n0 Save & exit';
      case 'report_confirm': return `CON ${compact(state.productName,32)}\n${compact(state.reason?.replaceAll('_',' '),22)} | ${state.county}\n1 Submit\n2 Add shop details\n3 Cancel\n0 Save & exit`;
      default: return 'END Session expired. Dial again.';
    }
  }

  private async offerReport(client: PoolClient, state: State, start: boolean) {
    const draft=await findDraft(client,state.farmerId!);
    if (draft && !draft.expired && draft.status==='active') {
      state.step='report_resume'; return resumeMenu;
    }
    if (!start) { state.step='account'; return accountMenu; }
    // Clear earlier verification/report fields when starting another report.
    const {farmerId,version}=state;
    for (const key of Object.keys(state)) delete state[key as keyof State];
    Object.assign(state,{farmerId,version});
    await startDraft(client,state);
    return this.prompt(state);
  }

  private async advance(client: PoolClient, state: State, answer: string, phone: string, user?: SessionUser): Promise<string> {
    if (answer === '0') return state.draftId || state.step==='report_resume'
      ? 'END Report progress saved. Dial again and sign in with your PIN to continue within 24 hours.'
      : 'END Thank you for using AgroVerify.';
    switch (state.step) {
      case 'home':
        if (answer === '1') { state.step='code'; return 'CON Enter the package code exactly as printed.\n0 Exit'; }
        if (answer === '2') { state.step='pin'; return 'CON Enter your 6-digit USSD PIN.\nSet or reset it in your website account.\n0 Exit'; }
        return home;
      case 'pin': {
        const farmer = await this.accounts.authenticate(client,phone,answer);
        if (!farmer) return 'END Phone or PIN not accepted. Try later or reset your PIN on the website.';
        state.farmerId=farmer.id; state.version=farmer.version;
        return this.offerReport(client,state,false);
      }
      case 'account':
        if (answer === '1') { state.step='code'; return 'CON Enter the package code exactly as printed.\n0 Exit'; }
        if (answer === '2') return this.offerReport(client,state,true);
        if (answer === '3') {
          const rows = (await client.query(`SELECT entered_code,result FROM verification_records WHERE farmer_id=$1 ORDER BY verified_at DESC,id DESC LIMIT 2`,[user!.id])).rows;
          return `END ${rows.length ? rows.map(r=>`${compact(r.entered_code,28)}: ${compact(r.result.replaceAll('_',' '),16)}`).join('\n') : 'No verification records yet.'}`;
        }
        if (answer === '4') {
          const rows = (await client.query(`SELECT id,product_name,status FROM product_reports WHERE farmer_id=$1 ORDER BY created_at DESC,id DESC LIMIT 2`,[user!.id])).rows;
          return `END ${rows.length ? rows.map(r=>`#${r.id} ${compact(r.product_name,28)}: ${r.status.replaceAll('_',' ')}`).join('\n') : 'No product reports yet.'}`;
        }
        return accountMenu;
      case 'report_resume': {
        if (answer==='3') { state.step='account'; return accountMenu; }
        if (!['1','2'].includes(answer)) return resumeMenu;
        const draft=await findDraft(client,state.farmerId!);
        if (!draft || draft.expired || draft.status!=='active') return this.offerReport(client,state,true);
        if (answer==='2') {
          state.draftId=draft.id; state.draftRevision=draft.revision;
          await finishDraft(client,state);
          return this.offerReport(client,state,true);
        }
        Object.assign(state,draft.state,{draftId:draft.id,draftRevision:draft.revision});
        return this.prompt(state);
      }
      case 'code':
        if (!answer) return 'CON Enter the package code.\n0 Exit';
        state.code=answer; state.step='verify_county'; delete state.countyChoices; state.countyPage=0; return this.prompt(state);
      case 'verify_county': case 'report_county': {
        const page = state.countyPage ?? 0;
        if (answer==='9') { state.countyChoices=[...countyNames]; state.countyPage=0; return this.prompt(state); }
        if (state.countyChoices && answer==='98' && (page+1)*4<state.countyChoices.length) { state.countyPage=page+1; return this.prompt(state); }
        if (state.countyChoices && answer==='99' && page>0) { state.countyPage=page-1; return this.prompt(state); }
        let county = state.countyChoices && /^[1-4]$/.test(answer) ? state.countyChoices[page*4+Number(answer)-1] : undefined;
        if (!county) {
          const matches=countyMatches(answer);
          if (matches.length===1) county=matches[0];
          else if (matches.length>1) { state.countyChoices=matches; state.countyPage=0; return this.prompt(state); }
        }
        if (!county) return this.prompt(state);
        state.county=county;
        delete state.countyChoices; delete state.countyPage;
        if (state.step === 'verify_county') {
          const result = await this.verification.verifyWithClient(parseVerification({code:state.code}),user,client,county);
          return resultMessage(String(result.result),result.product);
        }
        state.step='report_confirm'; return this.prompt(state);
      }
      case 'report_code': {
        if (!answer) return this.prompt(state);
        state.code=answer==='9'?undefined:answer;
        const product=state.code ? (await client.query<{id:string;name:string;category:string}>(`SELECT p.id,p.name,p.category FROM product_codes c
          JOIN products p ON p.id=c.product_id WHERE c.code_value=$1`,[state.code.toUpperCase()])).rows[0] : undefined;
        if (product) {
          state.productId=product.id; state.productName=product.name; state.category=product.category; state.step='report_reason';
        } else state.step='report_name';
        return this.prompt(state);
      }
      case 'report_name':
        if (answer.length<2) return this.prompt(state);
        state.productName=answer; state.step='report_category'; return this.prompt(state);
      case 'report_category':
        if (!['1','2'].includes(answer)) return this.prompt(state);
        state.category=answer==='1'?'seed':'fertilizer'; state.step='report_reason'; return this.prompt(state);
      case 'report_reason':
        if (!/^[1-6]$/.test(answer)) return this.prompt(state);
        state.reason=concernReasons[Number(answer)-1]; state.step='report_description'; return this.prompt(state);
      case 'report_description':
        if (answer.length<10) return this.prompt(state);
        state.description=answer; state.step='report_county'; return this.prompt(state);
      case 'report_seller':
        if (!answer) return this.prompt(state);
        state.sellerLocation=answer==='9'?undefined:answer;
        state.step=state.county?'report_confirm':'report_county'; return this.prompt(state);
      case 'report_confirm': {
        if (answer==='3') { await finishDraft(client,state); return 'END Report cancelled. Nothing submitted.'; }
        if (answer==='2') { state.step='report_seller'; return this.prompt(state); }
        if (answer!=='1') return this.prompt(state);
        const values = submission({productId:state.productId,productName:state.productName,category:state.category,codeValue:state.code,
          reason:state.reason,description:state.description,sellerLocation:state.sellerLocation,county:state.county});
        const id = await this.reports.createWithClient(values,user!.id,client,'ussd');
        await finishDraft(client,state,id);
        return `END Report #${id} submitted. An administrator will review it. Track its status in My reports or on the website.`;
      }
      default: return 'END Session expired. Dial again.';
    }
  }
}
