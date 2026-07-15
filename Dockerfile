FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json

RUN npm ci --include=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0

EXPOSE 3001

CMD ["npm", "start"]
