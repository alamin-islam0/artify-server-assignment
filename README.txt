Artify — Server (assignment)

This repository contains the server/API for the Artify demo store. It provides the backend endpoints used by the client application and is intended for local development and demonstration.

Client (live): https://artify-store.netlify.app/

Important features
- RESTful API endpoints for core e-commerce functionality (products, users, orders/cart).
- Database-backed: the server reads credentials from environment variables (`DB_USER`, `DB_PASS`).
- Built with Express and MongoDB client libraries (see `package.json`).
- Deployable to serverless platforms / Vercel (this repo includes Vercel config files).
- CORS-enabled and uses `dotenv` for local environment configuration.

Quick start
1. Create a `.env` file in the project root with the required environment variables (do NOT commit secrets):

	DB_USER=your_db_user
	DB_PASS=your_db_password

2. Install dependencies:

	npm install

3. Start the server locally:

	npm start

The server's main entry is `index.js` and additional API routes can be found in the `api/` folder.

Notes and best practices
- Keep `.env` and `.vercel` out of source control (they are typically in `.gitignore`).
- Do not paste or commit database passwords or other secrets. Use environment variables in your deployment pipeline.
- If you want to add more documentation, consider adding example requests for each endpoint and small JSON payload examples.

If you'd like, I can add usage examples (curl / Postman), badges, or screenshots next. 
