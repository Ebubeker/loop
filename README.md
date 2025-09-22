# Employee Activity Tracker

A comprehensive activity tracking and analysis system that monitors user activity via ActivityWatch, processes it using AI, and provides intelligent task summaries and insights.

## 🚀 Features

- **Real-time Activity Monitoring**: Automatic logging every 3 seconds via ActivityWatch
- **AI-Powered Task Processing**: Context-aware task detection and summarization using Gemini AI
- **Role-Based Access**: User interface for tracking, Admin interface for monitoring all users
- **Intelligent Context Switching**: Detects when users switch between different tasks
- **Processed Activity Logs**: Clean, summarized view of work sessions with durations
- **Background Processing**: Automated task processing worker for continuous monitoring

## 📋 Prerequisites

Before getting started, ensure you have the following installed:

1. **Node.js** (version 18.x or higher)
   - Download from [nodejs.org](https://nodejs.org/)
   
2. **ActivityWatch**
   - Download from [activitywatch.net](https://activitywatch.net/)
   - Required for activity monitoring

3. **Supabase Account**
   - Sign up at [supabase.com](https://supabase.com/)
   - You'll need database URL and API keys

4. **Gemini API Key**
   - Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

## 🛠 Installation

### 1. Install pnpm

pnpm is a fast, disk space efficient package manager. Install it globally:

**Option A: Using npm (if you have Node.js installed)**
```bash
npm install -g pnpm
```

**Option B: Using the installation script**
```bash
# On macOS/Linux
curl -fsSL https://get.pnpm.io/install.sh | sh -

# On Windows (PowerShell)
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

**Option C: Using Homebrew (macOS)**
```bash
brew install pnpm
```

Verify installation:
```bash
pnpm --version
```

### 2. Clone and Setup Project

```bash
# Clone the repository
git clone <your-repo-url>
cd tracker

# Install all dependencies
pnpm install
```

### 3. Environment Configuration

#### Backend Environment (API)
Create `apps/api/.env` file:

```env
# Database
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# AI Integration
GEMINI_API_KEY=your_gemini_api_key

# Server Configuration
PORT=3001

# Task Processing (optional - set to 'true' to auto-start background worker)
AUTO_START_TASK_PROCESSING=false
```

#### Frontend Environment (Web)
Create `apps/web/.env.local` file:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Database Setup

#### Required Tables
Create these tables in your Supabase database:

**user_profiles**
```sql
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**activity_logs**
```sql
CREATE TABLE activity_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  app TEXT,
  title TEXT,
  event_timestamp TIMESTAMP WITH TIME ZONE,
  event_duration TEXT,
  bucket_id TEXT,
  bucket_created TIMESTAMP WITH TIME ZONE,
  bucket_last_updated TIMESTAMP WITH TIME ZONE,
  afk_status TEXT DEFAULT 'not-afk',
  idle_time INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**processed_tasks**
```sql
CREATE TABLE processed_tasks (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  task_title TEXT NOT NULL,
  task_description TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'active',
  duration_minutes INTEGER DEFAULT 0,
  activity_summaries JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🏃‍♂️ Running the Application

### Development Mode

**Start both API and Web simultaneously:**
```bash
pnpm dev
```

**Or start individually:**

**Backend API (Port 3001):**
```bash
pnpm --filter api dev
```

**Frontend Web (Port 3000):**
```bash
pnpm --filter web dev
```

### Production Mode

**Build all applications:**
```bash
pnpm build
```

**Start production servers:**
```bash
pnpm start
```

## 🎯 Usage

### For Users
1. **Register/Login**: Create account or sign in
2. **Start Tracking**: Click "Start" button to begin activity monitoring
3. **Work Normally**: System automatically logs activities every 3 seconds
4. **View Processed Logs**: See intelligent task summaries with durations
5. **Stop Tracking**: Click "Stop" to end session

### For Administrators
1. **Login as Admin**: Use admin role account
2. **Select User**: Choose which user's logs to monitor
3. **View All Processed Tasks**: See detailed activity summaries for selected user
4. **Real-time Updates**: Logs refresh automatically every 10 seconds

### Setting Up Admin Users
Update user role in Supabase:
```sql
UPDATE user_profiles 
SET role = 'admin' 
WHERE id = 'your_user_id';
```

## 📁 Project Structure

```
tracker/
├── apps/
│   ├── api/                 # Backend API (Express.js)
│   │   ├── src/
│   │   │   ├── controllers/ # Route controllers
│   │   │   ├── services/    # Business logic
│   │   │   ├── routes/      # API routes
│   │   │   └── index.ts     # Entry point
│   │   └── package.json
│   └── web/                 # Frontend (Next.js)
│       ├── src/
│       │   ├── app/         # App router pages
│       │   ├── components/  # React components
│       │   ├── contexts/    # React contexts
│       │   └── lib/         # Utilities
│       └── package.json
├── package.json             # Root package.json
└── pnpm-workspace.yaml     # pnpm workspace config
```

## 🔧 Troubleshooting

### Common Issues

**1. ActivityWatch not connecting**
- Ensure ActivityWatch is installed and running
- Check if server is accessible at `http://localhost:5600`
- Restart ActivityWatch if needed

**2. Database connection errors**
- Verify Supabase URL and keys in `.env`
- Check if tables are created correctly
- Ensure Supabase project is active

**3. Gemini API errors**
- Verify API key is correct and active
- Check API quota limits
- Ensure internet connection for API calls

**4. Port conflicts**
- API runs on port 3001, Web on 3000
- Change ports in respective package.json files if needed

**5. pnpm installation issues**
- Clear pnpm cache: `pnpm store prune`
- Delete node_modules and reinstall: `rm -rf node_modules && pnpm install`

### Development Tips

**Hot reload not working?**
```bash
# Restart dev servers
pnpm dev
```

**Database changes not reflecting?**
- Check Supabase dashboard for schema updates
- Verify RLS (Row Level Security) policies if needed

**Task processing not working?**
- Check backend logs for errors
- Verify worker status via API: `GET /api/activity/worker/status`
- Manually start worker: `POST /api/activity/worker/start`

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the GitHub repository
- Check the troubleshooting section above
- Review Supabase and ActivityWatch documentation

---

**Happy Tracking! 🚀** 