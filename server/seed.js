import { pool } from "./db.js";

// Narrow demo scope: California Consumer Privacy Act / CPRA (jurisdiction "US-CA") only.
const REGULATIONS = [
  {
    topic: "right to delete",
    jurisdiction: "US-CA",
    summary:
      "Consumers can request deletion of personal information a business collected about them. The business must delete it and direct service providers/contractors to do the same, subject to listed exceptions (e.g. completing the transaction, security, legal compliance).",
    citation: "Cal. Civ. Code 1798.105 (CCPA/CPRA)",
  },
  {
    topic: "right to know",
    jurisdiction: "US-CA",
    summary:
      "Consumers can request the categories and specific pieces of personal information a business has collected, the sources, the business purpose, and any third parties it was shared with, covering the prior 12 months.",
    citation: "Cal. Civ. Code 1798.110 (CCPA/CPRA)",
  },
  {
    topic: "opt-out of sale or sharing",
    jurisdiction: "US-CA",
    summary:
      "Businesses that sell or share personal information must provide a clear 'Do Not Sell or Share My Personal Information' link and honor opt-out preference signals (e.g. Global Privacy Control).",
    citation: "Cal. Civ. Code 1798.120, 1798.135 (CCPA/CPRA)",
  },
  {
    topic: "right to correct",
    jurisdiction: "US-CA",
    summary:
      "Consumers can request correction of inaccurate personal information a business maintains about them.",
    citation: "Cal. Civ. Code 1798.106 (CPRA)",
  },
  {
    topic: "sensitive personal information",
    jurisdiction: "US-CA",
    summary:
      "Consumers can limit a business's use of sensitive personal information (e.g. SSN, precise geolocation, health data) to what is necessary to provide the requested goods or services.",
    citation: "Cal. Civ. Code 1798.121 (CPRA)",
  },
  {
    topic: "data breach notification",
    jurisdiction: "US-CA",
    summary:
      "Businesses must notify affected California residents of a breach of unencrypted personal information without unreasonable delay; notification to the Attorney General is required if more than 500 residents are affected.",
    citation: "Cal. Civ. Code 1798.29, 1798.82",
  },
  {
    topic: "minors data",
    jurisdiction: "US-CA",
    summary:
      "Businesses must obtain opt-in consent to sell or share personal information of consumers they know are under 16 (parent/guardian consent required under 13).",
    citation: "Cal. Civ. Code 1798.120(c) (CCPA/CPRA)",
  },
  {
    topic: "service provider contracts",
    jurisdiction: "US-CA",
    summary:
      "Contracts with service providers/contractors must restrict them to the specified business purpose, prohibit selling/sharing the data further, and require compliance with CCPA obligations.",
    citation: "Cal. Civ. Code 1798.100(d) (CPRA)",
  },
];

async function seed() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS regulations (
      id SERIAL PRIMARY KEY,
      topic TEXT NOT NULL,
      jurisdiction TEXT NOT NULL,
      summary TEXT NOT NULL,
      citation TEXT NOT NULL,
      UNIQUE (topic, jurisdiction)
    );
  `);

  for (const r of REGULATIONS) {
    await pool.query(
      `INSERT INTO regulations (topic, jurisdiction, summary, citation)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (topic, jurisdiction) DO UPDATE
       SET summary = EXCLUDED.summary, citation = EXCLUDED.citation`,
      [r.topic, r.jurisdiction, r.summary, r.citation]
    );
  }

  console.log(`Seeded ${REGULATIONS.length} regulations.`);
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
