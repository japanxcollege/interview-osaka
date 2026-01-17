#!/bin/bash

# Kill background processes on exit
trap "trap - SIGTERM && kill -- -$$" SIGINT SIGTERM EXIT

echo "Starting Interview Editor Local Development Environment..."

# Section 1: Backend
echo "--------------------------------------------------"
echo "Setting up Backend..."
cd backend

# Check if venv exists, if not create it (optional, but good for first run)
if [ ! -d "venv" ]; then
    echo "Creating python virtual environment..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

# Install dependencies if needed (rudimentary check)
# It's cleaner to just run it, pip is fast if cached.
echo "Ensuring backend dependencies are installed..."
pip install -r requirements.txt > /dev/null

echo "Starting Backend Server (FastAPI)..."
# Assuming main.py has app instance and uvicorn runs it. 
# Usually: uvicorn main:app --reload
# Or if main.py has `if __name__ == "__main__": uvicorn.run(...)`
# Let's try running main.py directly first, if that fails we fall back to uvicorn.
python main.py &
BACKEND_PID=$!

cd ..

# Section 2: Frontend
echo "--------------------------------------------------"
echo "Setting up Frontend..."
cd frontend

echo "Starting Frontend Server (Next.js)..."
# Assuming npm or pnpm is available. The user has pnpm in packageManager but let's check.
if command -v pnpm &> /dev/null; then
    pnpm dev &
    FRONTEND_PID=$!
else
    npm run dev &
    FRONTEND_PID=$!
fi

echo "--------------------------------------------------"
echo "Frontend running on http://localhost:3002"
echo "Backend running (check logs for port)"
echo "Press Ctrl+C to stop both servers."

wait
