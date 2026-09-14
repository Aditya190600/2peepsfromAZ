import { defineRailway, project, service } from "railway/iac";

export default defineRailway(() => {
  const web = service("complyline", {
    build: "npm run build",
    start: "npm start",
  });

  return project("complyline", {
    resources: [web],
  });
});
