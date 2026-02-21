import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';

const repo = new SubscriptionsRepository();
const service = new SubscriptionsService(repo);
const controller = new SubscriptionsController(service);

export const subscriptionsRouter = Router();

subscriptionsRouter.use(authenticate);

subscriptionsRouter.get('/me', controller.getMySubscription.bind(controller));
subscriptionsRouter.post('/upgrade', controller.upgrade.bind(controller));
subscriptionsRouter.delete('/me', controller.cancel.bind(controller));
