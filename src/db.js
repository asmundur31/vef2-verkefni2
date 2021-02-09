import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const {
  DATABASE_URL: connectionString,
} = process.env;

if (!connectionString) {
  console.error('Vantar DATABASE_URL');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Fall sem framkvæmir viðeigandi SQL fyrirspurn á gagnagrunn
 * @param {string} q Srengur sem inniheldur SQL fyrirspurn
 * @param {list} values listi af parametrum sem eiga að fara inn í fyrirspurnarstrenginn
 * @returns Skilar því sem að SQL fyrirspurnin skilar eða null ef fyrirspurnin gekk ekki upp
 */
export async function query(q, values = []) {
  const client = await pool.connect();

  try {
    const result = await client.query(q, values);
    return result;
  } catch (e) {
    console.error('Error selecting', e);
    return null;
  } finally {
    client.release();
  }
}
