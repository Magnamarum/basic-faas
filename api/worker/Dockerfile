FROM node

WORKDIR /usr/src/app

COPY package*.json ./
COPY . .


RUN npm install
EXPOSE 5554

CMD ["npm", "start"]
