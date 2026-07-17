FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN ["npm","ci"]
COPY . .
RUN ["npm","run","build"]
USER node
EXPOSE 3000
ENTRYPOINT ["node","dist/server.js"]
CMD ["--port","3000"]
