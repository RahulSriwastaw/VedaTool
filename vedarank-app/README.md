# VedaRank - Exam Result Analyzer

Separate website for VedaRank that shares the same Firebase (Firestore) database as vedatool.

## Features

- 🔗 URL se result parse karo
- 📋 HTML paste karke analyze karo  
- 📤 File upload support
- 📊 User Dashboard with history
- 🛡️ Super Admin panel (sabhi users ke questions dikhte hain)
- 🔥 Same Firebase database (vedatool project)

## Firestore Database Schema

```
vedarank_submissions/
  ├── {docId}
  │   ├── submissionId: string
  │   ├── userId: string
  │   ├── userEmail: string
  │   ├── userName: string
  │   ├── questions: Array<Question>
  │   │   ├── id: string
  │   │   ├── questionText: string
  │   │   ├── options: string[]
  │   │   ├── answer: string
  │   │   ├── isCorrect: boolean
  │   │   └── userAnswer: string
  │   ├── score: number
  │   ├── metadata: Object
  │   │   ├── totalQuestions: number
  │   │   ├── correctAnswers: number
  │   │   ├── incorrectAnswers: number
  │   │   └── parsedAt: string (ISO timestamp)
  │   ├── inputMode: 'url' | 'paste' | 'upload'
  │   └── createdAt: Timestamp

vedarank_admins/
  ├── {userId}  (document ID = Firebase Auth UID)
  │   └── role: 'super_admin'
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the backend server:
```bash
npm run server
```

3. Start the frontend dev server:
```bash
npm run dev
```

4. Open: http://localhost:5174

## Making a user Super Admin

Firestore me `vedarank_admins` collection me ek document banao:
- Document ID = User ka Firebase UID
- Fields: `{ role: "super_admin" }`

## Tech Stack

- React 19 + TypeScript
- Vite
- TailwindCSS v4
- Firebase (Auth + Firestore)
- Express backend
- Lucide Icons
