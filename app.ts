import { app } from 'mu';
import { ErrorRequestHandler } from 'express';
import { formDefinitionRouter } from './controllers/form-definitions';
import { formInstanceRouter } from './controllers/form-instances';
import { instanceTableRouter } from './controllers/instance-table';
import { loadFormsFromConfig } from './services/forms-from-config';

loadFormsFromConfig();

app.get('/', async (_req, res) => {
  res.send({ status: 'ok' });
});

app.use('/', formInstanceRouter);

app.use('/instance-table', instanceTableRouter);

app.use('/', formDefinitionRouter);

const errorHandler: ErrorRequestHandler = function (err, _req, res, _next) {
  // custom error handler to have a default 500 error code instead of 400 as in the template
  res.status(err.status || 500);
  console.error(err);

  res.json({
    errors: [{ title: err.message }],
  });
};

app.use(errorHandler);
