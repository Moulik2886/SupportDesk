import pg from 'pg';
import bcrypt from 'bcryptjs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_SIZE || 1) });
export const query = (sql, params) => pool.query(sql, params);
export const withTransaction = async (fn) => {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
};

export async function initializeDatabase() {
  await query(`CREATE TABLE IF NOT EXISTS workspaces (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, name text NOT NULL, email text NOT NULL, password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('owner','agent','viewer')), avatar_color text NOT NULL DEFAULT '#2563eb', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,email));
  CREATE TABLE IF NOT EXISTS tickets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, ticket_number text NOT NULL, subject text NOT NULL, description text NOT NULL, customer_name text NOT NULL, customer_email text NOT NULL, status text NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','In progress','Pending','Resolved','Closed')), priority text NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low','Normal','High','Urgent')), assigned_to uuid REFERENCES users(id) ON DELETE SET NULL, created_by uuid NOT NULL REFERENCES users(id), sla_due_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, UNIQUE(workspace_id,ticket_number));
  CREATE TABLE IF NOT EXISTS ticket_comments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id), message text NOT NULL, is_internal boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS canned_responses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, title text NOT NULL, body text NOT NULL);
  CREATE TABLE IF NOT EXISTS ticket_counters (workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE, last_number integer NOT NULL DEFAULT 100);
  CREATE INDEX IF NOT EXISTS tickets_workspace_created_idx ON tickets(workspace_id,created_at DESC); CREATE INDEX IF NOT EXISTS tickets_workspace_status_idx ON tickets(workspace_id,status); CREATE INDEX IF NOT EXISTS tickets_assignee_idx ON tickets(assigned_to); CREATE INDEX IF NOT EXISTS comments_ticket_idx ON ticket_comments(ticket_id,created_at);`);

  const { rows: wsRows } = await query(`INSERT INTO workspaces(name) SELECT 'Northstar Support' WHERE NOT EXISTS(SELECT 1 FROM workspaces) RETURNING id`);
  const { rows: workspaceRows } = await query('SELECT id FROM workspaces ORDER BY created_at LIMIT 1');
  const workspaceId = wsRows[0]?.id ?? workspaceRows[0].id;
  const seedUsers = [
    ['Moulik Shah','owner@supportdesk.local','owner'], ['Priya Sharma','priya@supportdesk.local','agent'], ['Jordan Lee','jordan@supportdesk.local','agent'], ['Read Only','viewer@supportdesk.local','viewer']
  ];
  for (const [name,email,role] of seedUsers) {
    await query(`INSERT INTO users(workspace_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id,email) DO NOTHING`, [workspaceId,name,email,await bcrypt.hash('SupportDesk!2026',10),role]);
  }
  const { rows: users } = await query('SELECT id,name,email,role FROM users WHERE workspace_id=$1 ORDER BY created_at', [workspaceId]);
  const owner = users.find(u => u.role === 'owner'); const agents = users.filter(u => u.role === 'agent');
  const tickets = [
    ['SD-2026-0101','Unable to access my account','I reset my password twice, but the sign-in page keeps returning an error. Can you help me regain access?','Olivia Chen','olivia.chen@example.com','Urgent','Open',agents[0]?.id,4],
    ['SD-2026-0102','Invoice shows the wrong billing address','Our latest invoice has our old office address. Please update the account and send a corrected copy.','Marcus Williams','marcus.w@example.com','High','In progress',agents[0]?.id,8],
    ['SD-2026-0103','How do I invite a teammate?','I am setting up our workspace and would like to add two colleagues.','Amara Patel','amara.patel@example.com','Normal','Open',agents[1]?.id,24],
    ['SD-2026-0104','Feature request: export reports','It would be helpful to export monthly analytics as a CSV for our finance team.','Ethan Brooks','ethan.brooks@example.com','Low','Pending',agents[1]?.id,72],
    ['SD-2026-0105','Checkout page is timing out','The checkout has been spinning for several minutes across multiple browsers.','Sofia Garcia','sofia.garcia@example.com','Urgent','Open',null,-2],
    ['SD-2026-0106','Confirm plan cancellation','Please confirm that our subscription has been cancelled at the end of this month.','Noah Kim','noah.kim@example.com','Normal','Resolved',agents[0]?.id,24]
  ];
  for (const [number,subject,description,customerName,customerEmail,priority,status,assignee,hours] of tickets) {
    await query(`INSERT INTO tickets(workspace_id,ticket_number,subject,description,customer_name,customer_email,priority,status,assigned_to,created_by,sla_due_at,resolved_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()+($11::text||' hours')::interval,CASE WHEN $8='Resolved' THEN now()-interval '1 hour' END) ON CONFLICT(workspace_id,ticket_number) DO NOTHING`,
      [workspaceId,number,subject,description,customerName,customerEmail,priority,status,assignee ?? null,owner.id,hours]);
  }
  const ticketRows = await query(`SELECT id,ticket_number FROM tickets WHERE workspace_id=$1 ORDER BY ticket_number`,[workspaceId]);
  for (const [number,message] of [['SD-2026-0101','Thanks for reaching out, Olivia. I’m checking the sign-in logs and will get back to you shortly.'],['SD-2026-0102','I’ve updated your billing details and requested a corrected invoice.']]) {
    const ticket = ticketRows.rows.find(t=>t.ticket_number===number);
    await query(`INSERT INTO ticket_comments(ticket_id,user_id,message) SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM ticket_comments WHERE ticket_id=$1)`,[ticket.id,agents[0].id,message]);
  }
  const responses = [['Greeting','Hi {{customer_name}}, thanks for contacting our support team.'],['Need more details','Could you share a screenshot and the steps you took so we can investigate?'],['Resolved','This has been resolved. Please let us know if you need anything else.']];
  for(const [title,body] of responses) await query(`INSERT INTO canned_responses(workspace_id,title,body) SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM canned_responses WHERE workspace_id=$1 AND title=$2)`,[workspaceId,title,body]);
  return workspaceId;
}

export async function closeDatabase(){ await pool.end(); }
