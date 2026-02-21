import { createApp } from '../../../app';
import supertest from 'supertest';

export function createTestApp() {
  const app = createApp();
  return supertest(app);
}
