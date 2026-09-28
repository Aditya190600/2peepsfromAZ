import { defineRailway, postgres, project, service } from "railway/iac";

export default defineRailway(() => {
  const db = postgres("postgres");

  const web = service("complyline", {
    build: "npm run build",
    start: "npm start",
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      QUALEVAL_ADMIN_EMAILS:
        "sujeevraja26@gmail.com,sai.9500@gmail.com",
    },
  });

  return project("complyline", {
    resources: [db, web],
  });
});
