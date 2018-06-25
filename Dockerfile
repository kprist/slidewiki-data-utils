FROM node:8-slim

RUN mkdir /nodeApp
WORKDIR /nodeApp

# add source code
ADD . /nodeApp

# package and install tool
RUN npm pack && npm install -g slidewiki-data-utils-0.0.1.tgz

# clean up
RUN rm -rf /nodeApp/*
