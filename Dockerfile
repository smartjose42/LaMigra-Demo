FROM node:18
RUN apt-get update && apt-get install -y pdftk
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
