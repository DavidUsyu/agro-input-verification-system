export async function seedDemo(client) {
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(169382, 2)');
    const administrator = (await client.query("SELECT a.user_id FROM administrators a JOIN users u ON u.id=a.user_id WHERE u.status='active' ORDER BY a.user_id LIMIT 1")).rows[0];
    if (!administrator) throw new Error('Create an administrator first with npm run admin:create, then rerun npm run demo:seed.');
    const examples = [
      { name: 'DEMO — Maize seed', category: 'seed', reference: 'DEMO-ONLY-SEED', codes: [['DEMO-SEED-OK','active',false],['DEMO-SEED-EXPIRED','active',true]] },
      { name: 'DEMO — Fertilizer', category: 'fertilizer', reference: 'DEMO-ONLY-FERTILIZER', codes: [['DEMO-FERT-OK','active',false],['DEMO-FERT-FLAGGED','suspicious',false],['DEMO-FERT-INACTIVE','inactive',false]] },
    ];
    for (const example of examples) {
      let product = (await client.query('SELECT id FROM products WHERE name=$1 AND registration_no=$2 ORDER BY id LIMIT 1',[example.name,example.reference])).rows[0];
      if (!product) product = (await client.query(`INSERT INTO products (name,category,manufacturer,registration_no,description,status,created_by)
        VALUES ($1,$2,'Demonstration supplier only',$3,'DEMONSTRATION DATA ONLY. This record does not describe a real approved product.','active',$4) RETURNING id`,[example.name,example.category,example.reference,administrator.user_id])).rows[0];
      for (const [code,status,expired] of example.codes) {
        const existing = (await client.query('SELECT product_id FROM product_codes WHERE upper(code_value)=$1',[code])).rows[0];
        if (existing) {
          if (existing.product_id !== product.id) throw new Error(`Demo code ${code} already belongs to another product. No records were changed.`);
          continue;
        }
        await client.query(`INSERT INTO product_codes (product_id,code_value,batch_number,manufacture_date,expiry_date,verification_status)
          VALUES ($1,$2,'DEMO-BATCH',(CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Nairobi')::date - 730,
            (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Nairobi')::date + $3::integer,$4)`,[product.id,code,expired ? -1 : 365,status]);
      }
    }
    await client.query('COMMIT');
    return examples.flatMap((example)=>example.codes.map(([code,status,expired])=>({code,expected:status==='suspicious'?'suspicious':status==='inactive'?'inactive':expired?'expired':'verified'})));
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
