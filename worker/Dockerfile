FROM node

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY index.ts ./

EXPOSE 5554

#CMD ["npm", "start"]
