FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts
COPY seed ./seed

ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/index.js"]