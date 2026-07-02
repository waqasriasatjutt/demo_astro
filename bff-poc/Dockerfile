FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs demo.html docs.html ./
EXPOSE 3000
CMD ["node", "server.mjs"]
