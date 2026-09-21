import { defineRailway, postgres, project, service } from "railway/iac";

export default defineRailway(() => {
  const db = postgres("postgres");

  const web = service("complyline", {
    build: "npm run build",
    start: "npm start",
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
    },
  });

  return project("complyline", {
    resources: [db, web],
  });
});
