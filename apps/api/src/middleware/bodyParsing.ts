import express, { type Express } from 'express';

// Request-body parsers, mounted once here so the app and its tests share one definition.
export const applyBodyParsing = (app: Express): void => {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
};
