import { app, errorHandler } from "mu";

app.get("/", async function (_req, res) {
  res.send({ status: "ok" });
});

app.use(errorHandler);
