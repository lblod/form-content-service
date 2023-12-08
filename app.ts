import { app, errorHandler } from "mu";
import {
  fetchFormDefinitionById,
  loadFormsFromConfig,
} from "./form-repository";

loadFormsFromConfig();

app.get("/", async function (_req, res) {
  res.send({ status: "ok" });
});

app.get("/:id", async function (_req, res) {
  const form = await fetchFormDefinitionById(_req.params.id);
  if (!form) {
    res.send(404);
    return;
  }
  res.send(form);
});

app.use(errorHandler);
