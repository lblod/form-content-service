import { app } from 'mu';
import { ErrorRequestHandler } from 'express';
import { formDefinitionRouter } from './controllers/form-definitions';
import { formInstanceRouter } from './controllers/form-instances';
import { loadFormsFromConfig } from './services/forms-from-config';

loadFormsFromConfig();

app.get('/', async (_req, res) => {
  res.send({ status: 'ok' });
});

app.use('/', formDefinitionRouter);

app.use('/', formInstanceRouter);

const errorHandler: ErrorRequestHandler = function (err, _req, res, _next) {
  // custom error handler to have a default 500 error code instead of 400 as in the template
  res.status(err.status || 500);
  res.json({
    errors: [{ title: err.message }],
  });
};

app.use(errorHandler);
