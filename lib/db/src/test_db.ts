import pg from 'pg';

const hosts = ['127.0.0.1', 'localhost', '::1'];

async function testConnection(host: string) {
  const client = new pg.Client({
    user: 'postgres',
    host: host,
    database: 'postgres',
    password: 'biopay123',
    port: 5432,
  });
  try {
    await client.connect();
    console.log(`SUCCESS: Connected to ${host} using password biopay123`);
    await client.end();
    return true;
  } catch (err: any) {
    console.log(`FAILED for host "${host}": ${err.message}`);
    return false;
  }
}

async function main() {
  for (const host of hosts) {
    if (await testConnection(host)) {
      break;
    }
  }
}

main();
