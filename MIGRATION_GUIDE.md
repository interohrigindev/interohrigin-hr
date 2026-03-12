# Migration Guide: InterOhrigin HR

This workspace has been migrated from the source repository. Follow these steps to complete the setup.

## 1. Supabase Setup

You need a Supabase project to run this application.

1.  **Create a Project:** Go to [Supabase](https://supabase.com/) and create a new project.
2.  **Run SQL Setup:**
    *   Open the `supabase_setup.sql` file in this workspace.
    *   Copy the entire content.
    *   Go to your Supabase Project Dashboard -> **SQL Editor**.
    *   Paste the content and click **Run**.
    *   Verify that the output shows success. This script creates all tables, functions, views, and an initial Admin account.

## 2. Environment Configuration

1.  **Get Credentials:**
    *   In Supabase Dashboard, go to **Project Settings** -> **API**.
    *   Copy the **Project URL** and **anon public key**.
2.  **Update `.env`:**
    *   Open the `.env` file in the project root.
    *   Replace `YOUR_SUPABASE_URL` with your Project URL.
    *   Replace `YOUR_SUPABASE_ANON_KEY` with your `anon` key.

## 3. Running the Application

1.  Start the development server:
    ```bash
    npm run dev
    ```
2.  Open the application in your browser (usually `http://localhost:5173`).

## 4. Initial Login

An admin account has been created for you:
*   **Email:** `admin@interohrigin.com`
*   **Password:** `AdminPassword123!`

Use these credentials to log in and access the dashboard.

## Migration Details

*   **Codebase:** All source code has been migrated from the GitHub repository.
*   **Database:** The schema and seed data (departments, categories, items) have been consolidated into `supabase_setup.sql`. The database structure has been updated to the latest 4-role system (Employee, Leader, Director, CEO).
*   **Dependencies:** `npm install` has been run.
