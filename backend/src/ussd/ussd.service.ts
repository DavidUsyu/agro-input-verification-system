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
import { accountMenu, compact, concernReasons, countyMenu, home, reasonMenu, resultMessage } from './menus';

interface State {
  step?: string; farmerId?: string; version?: string; code?: string; county?: string;
  countyPage?: number; productName?: string; category?: string; reason?: string;
  description?: string; sellerLocation?: string;
}
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
      const response = await this.advance(client,row.state,input.parts.at(-1)!.trim(),input.phone,user);
      if (response.length > 160) throw new Error('USSD screen exceeded its character budget.');
      const closed = response.startsWith('END ');
      await client.query(`UPDATE ussd_sessions SET state=$2,farmer_id=$3,depth=$4,text_digest=$5,response=$6,closed=$7 WHERE id=$1`,
        [input.sessionId,closed ? {farmerId:row.state.farmerId,version:row.state.version} : row.state,row.state.farmerId ?? null,input.parts.length,digest,response,closed]);
      return response;
    });
  }

  private async advance(client: PoolClient, state: State, answer: string, phone: string, user?: SessionUser): Promise<string> {
    if (answer === '0') return 'END Thank you for using AgroVerify.';
    switch (state.step) {
      case 'home':
        if (answer === '1') { state.step='code'; return 'CON Enter the package code exactly as printed.\n0 Exit'; }
        if (answer === '2') { state.step='pin'; return 'CON Enter your 6-digit USSD PIN.\nSet or reset it in your website account.\n0 Exit'; }
        return home;
      case 'pin': {
        const farmer = await this.accounts.authenticate(client,phone,answer);
        if (!farmer) return 'END Phone or PIN not accepted. Try later or reset your PIN on the website.';
        state.farmerId=farmer.id; state.version=farmer.version; state.step='account'; return accountMenu;
      }
      case 'account':
        if (answer === '1') { state.step='code'; return 'CON Enter the package code exactly as printed.\n0 Exit'; }
        if (answer === '2') { state.step='report_code'; return 'CON Enter package code, or 9 if there is no code.\n0 Exit'; }
        if (answer === '3') {
          const rows = (await client.query(`SELECT entered_code,result FROM verification_records WHERE farmer_id=$1 ORDER BY verified_at DESC,id DESC LIMIT 2`,[user!.id])).rows;
          return `END ${rows.length ? rows.map(r=>`${compact(r.entered_code,28)}: ${compact(r.result.replaceAll('_',' '),16)}`).join('\n') : 'No verification records yet.'}`;
        }
        if (answer === '4') {
          const rows = (await client.query(`SELECT id,product_name,status FROM product_reports WHERE farmer_id=$1 ORDER BY created_at DESC,id DESC LIMIT 2`,[user!.id])).rows;
          return `END ${rows.length ? rows.map(r=>`#${r.id} ${compact(r.product_name,28)}: ${r.status.replaceAll('_',' ')}`).join('\n') : 'No product reports yet.'}`;
        }
        return accountMenu;
      case 'code':
        if (!answer) return 'CON Enter the package code.\n0 Exit';
        state.code=answer; state.step='verify_county'; state.countyPage=0; return countyMenu(0);
      case 'verify_county': case 'report_county': {
        const page = state.countyPage ?? 0;
        if (answer === '98' && page<11) { state.countyPage=page+1; return countyMenu(page+1); }
        if (answer === '99' && page>0) { state.countyPage=page-1; return countyMenu(page-1); }
        const county = /^[1-4]$/.test(answer) ? countyNames[page*4+Number(answer)-1] : undefined;
        if (!county) return countyMenu(page);
        state.county=county;
        if (state.step === 'verify_county') {
          const result = await this.verification.verifyWithClient(parseVerification({code:state.code}),user,client,county);
          return resultMessage(String(result.result),result.product);
        }
        state.step='report_confirm'; return 'CON Submit this product concern?\n1 Submit\n2 Cancel\n0 Exit';
      }
      case 'report_code':
        if (!answer) return 'CON Enter package code, or 9 if there is no code.\n0 Exit';
        state.code=answer==='9'?undefined:answer; state.step='report_name'; return 'CON Enter the product name (up to 80 characters).\n0 Exit';
      case 'report_name':
        if (answer.length<2) return 'CON Enter a product name of at least 2 characters.\n0 Exit';
        state.productName=answer; state.step='report_category'; return 'CON Product type\n1 Seed\n2 Fertilizer\n0 Exit';
      case 'report_category':
        if (!['1','2'].includes(answer)) return 'CON Product type\n1 Seed\n2 Fertilizer\n0 Exit';
        state.category=answer==='1'?'seed':'fertilizer'; state.step='report_reason'; return reasonMenu;
      case 'report_reason':
        if (!/^[1-6]$/.test(answer)) return reasonMenu;
        state.reason=concernReasons[Number(answer)-1]; state.step='report_description'; return 'CON Describe the concern in 10-80 characters.\n0 Exit';
      case 'report_description':
        if (answer.length<10) return 'CON Please describe the concern in 10-80 characters.\n0 Exit';
        state.description=answer; state.step='report_seller'; return 'CON Enter shop or market location, or 9 to skip.\n0 Exit';
      case 'report_seller':
        state.sellerLocation=answer==='9'?undefined:answer; state.step='report_county'; state.countyPage=0; return countyMenu(0);
      case 'report_confirm': {
        if (answer==='2') return 'END Report cancelled. Nothing submitted.';
        if (answer!=='1') return 'CON Submit this product concern?\n1 Submit\n2 Cancel\n0 Exit';
        // Product matching stays private. Farmer-entered names remain as submitted, as on the web unknown-product form.
        const values = submission({productName:state.productName,category:state.category,codeValue:state.code,
          reason:state.reason,description:state.description,sellerLocation:state.sellerLocation,county:state.county});
        const id = await this.reports.createWithClient(values,user!.id,client,'ussd');
        return `END Report #${id} submitted. An administrator will review it. Track its status in My reports or on the website.`;
      }
      default: return 'END Session expired. Dial again.';
    }
  }
}
