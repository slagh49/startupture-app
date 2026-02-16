FROM node:20-alpine

# Install build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy app source
COPY server/ ./server/
COPY public/ ./public/

# Data volume for SQLite persistence
RUN mkdir -p /data
VOLUME ["/data"]

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/starrupture.db

EXPOSE 3000

CMD ["node", "server/index.js"]
