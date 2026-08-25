FROM node:22-slim
WORKDIR /app
COPY . .
RUN cd client && npm ci && npm run build && cd ../server && npm ci
WORKDIR /app/server
RUN node src/db/seed.js
EXPOSE 4000
CMD ["node","src/index.js"]
