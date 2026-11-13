FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY src ./src
RUN addgroup -S nevoz && adduser -S nevoz -G nevoz && mkdir -p /data && chown -R nevoz:nevoz /app /data
USER nevoz
EXPOSE 8080
CMD ["node", "src/server.js"]
