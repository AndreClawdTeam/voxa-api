FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache python3 py3-pip pkgconf ffmpeg-dev gcc musl-dev && \
    pip3 install faster-whisper --break-system-packages && \
    apk del gcc musl-dev pkgconf ffmpeg-dev
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
