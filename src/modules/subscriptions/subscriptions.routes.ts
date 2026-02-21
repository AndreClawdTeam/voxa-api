import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';

const repo = new SubscriptionsRepository();
const service = new SubscriptionsService(repo);
const controller = new SubscriptionsController(service);

export const subscriptionsRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Subscriptions
 *   description: Manage your subscription plan
 */

subscriptionsRouter.use(authenticate);

/**
 * @swagger
 * /subscriptions/me:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get current user subscription
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current subscription details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     tier:
 *                       type: string
 *                       enum: [trial, basic, pro]
 *                     status:
 *                       type: string
 *                       enum: [active, trial, suspended, cancelled]
 *                     trialEndsAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *       404:
 *         description: No subscription found
 */
subscriptionsRouter.get('/me', controller.getMySubscription.bind(controller));

/**
 * @swagger
 * /subscriptions/upgrade:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Upgrade to a higher tier
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tier
 *             properties:
 *               tier:
 *                 type: string
 *                 enum: [basic, pro]
 *                 example: basic
 *     responses:
 *       200:
 *         description: Subscription upgraded
 *       409:
 *         description: Already on the requested tier
 */
subscriptionsRouter.post('/upgrade', controller.upgrade.bind(controller));

/**
 * @swagger
 * /subscriptions/me:
 *   delete:
 *     tags: [Subscriptions]
 *     summary: Cancel current subscription
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription cancelled
 *       404:
 *         description: No subscription found
 */
subscriptionsRouter.delete('/me', controller.cancel.bind(controller));
