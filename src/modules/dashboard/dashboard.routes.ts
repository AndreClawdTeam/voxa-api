import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { DashboardController } from './dashboard.controller';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';

const repo = new DashboardRepository();
const service = new DashboardService(repo);
const controller = new DashboardController(service);

export const dashboardRouter = Router();

// All dashboard routes require JWT authentication
dashboardRouter.use(authenticate);

/** GET /api/v1/dashboard/usage — Usage summary for the current user */
dashboardRouter.get('/usage', controller.getUsage.bind(controller));

/** GET /api/v1/dashboard/transcriptions — Paginated transcription history */
dashboardRouter.get('/transcriptions', controller.getTranscriptions.bind(controller));

/** GET /api/v1/dashboard/profile — User profile */
dashboardRouter.get('/profile', controller.getProfile.bind(controller));

/** PATCH /api/v1/dashboard/profile — Update user profile */
dashboardRouter.patch('/profile', controller.updateProfile.bind(controller));
