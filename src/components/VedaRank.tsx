import React, { useState } from 'react';

interface ParsedQuestion {
  id: string;
  questionText: string;
  options: string[];
  answer: string;
  isCorrect: boolean;
  userAnswer: string;
}

interface ParseResult {
  success: boolean;
  submissionId: string;
  questions: ParsedQuestion[];
  score: number;
  metadata: {
    totalQuestions: number;
    correctAnswers: number;
    incorrectAnswers: number;
    parsedAt: string;
  };
}

const VedaRank = () => {
  const [activeTab, setActiveTab] = useState<'url' | 'paste' | 'upload'>('url');
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/parse-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: activeTab,
          [activeTab === 'url' ? 'url' : 'html']: inputValue
        }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to parse');
      }
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-12">
      <h1 className="text-3xl font-bold text-slate-100 mb-2">VedaRank</h1>
      <p className="text-slate-400 mb-8">Apna Exam Response Sheet analyze karein.</p>

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-700 mb-6">
        <button
          className={`py-2 px-4 text-sm font-medium ${activeTab === 'url' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400'}`}
          onClick={() => { setActiveTab('url'); setInputValue(''); }}
        >
          🔗 URL Link
        </button>
        <button
          className={`py-2 px-4 text-sm font-medium ${activeTab === 'paste' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400'}`}
          onClick={() => { setActiveTab('paste'); setInputValue(''); }}
        >
          📋 Paste HTML
        </button>
        <button
          className={`py-2 px-4 text-sm font-medium ${activeTab === 'upload' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400'}`}
          onClick={() => { setActiveTab('upload'); setInputValue(''); }}
        >
          📤 Upload File
        </button>
      </div>

      {/* Tab Content */}
      <div className="bg-slate-900 p-6 rounded-lg border border-slate-800">
        {activeTab === 'url' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Response Sheet URL:</label>
            <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded p-3 text-slate-100" placeholder="https://rrb.digialm.com/..." />
          </div>
        )}
        {activeTab === 'paste' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Paste HTML Source:</label>
            <textarea value={inputValue} onChange={(e) => setInputValue(e.target.value)} className="w-full h-40 bg-slate-800 border border-slate-700 rounded p-3 text-slate-100" placeholder="<html>...</html>"></textarea>
          </div>
        )}
        {activeTab === 'upload' && (
          <div className="border-2 border-dashed border-slate-700 p-8 text-center rounded-lg">
            <p className="text-slate-400">Drag & Drop HTML or MHT file here</p>
            <input type="file" className="mt-4" onChange={(e) => { /* handle file logic */ }} />
          </div>
        )}
        
        {error && <p className="text-red-400 mt-4 text-sm">{error}</p>}
        
        <button 
          onClick={handleSubmit}
          disabled={loading}
          className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded transition disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Result Dekho →'}
        </button>
      </div>

      {/* Results Section */}
      {result && (
        <div className="mt-8 bg-slate-900 p-6 rounded-lg border border-slate-800">
          <h2 className="text-2xl font-bold text-slate-100 mb-4">Analysis Results</h2>
          
          {/* Summary Card */}
          <div className="bg-slate-800 p-4 rounded-lg mb-6 border border-slate-700">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-slate-400 text-sm">Total Questions</p>
                <p className="text-2xl font-bold text-indigo-400">{result.metadata.totalQuestions}</p>
              </div>
              <div className="text-center">
                <p className="text-slate-400 text-sm">Score</p>
                <p className="text-2xl font-bold text-green-400">{result.score}</p>
              </div>
              <div className="text-center">
                <p className="text-slate-400 text-sm">Correct</p>
                <p className="text-2xl font-bold text-green-400">{result.metadata.correctAnswers}</p>
              </div>
              <div className="text-center">
                <p className="text-slate-400 text-sm">Incorrect</p>
                <p className="text-2xl font-bold text-red-400">{result.metadata.incorrectAnswers}</p>
              </div>
            </div>
            <p className="text-slate-500 text-xs mt-3 text-center">Submission ID: {result.submissionId}</p>
          </div>

          {/* Questions List */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-100 mb-3">Questions</h3>
            {result.questions.map((question, index) => (
              <div key={question.id} className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                <div className="flex items-start gap-3">
                  <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded mt-1">
                    Q{index + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-slate-100 text-sm mb-2">{question.questionText}</p>
                    {question.options && question.options.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {question.options.map((option, optIndex) => (
                          <p key={optIndex} className="text-slate-400 text-xs">
                            {String.fromCharCode(65 + optIndex)}. {option}
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-4 text-xs">
                      <span className={`px-2 py-1 rounded ${question.isCorrect ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                        {question.isCorrect ? '✓ Correct' : '✗ Incorrect'}
                      </span>
                      {question.answer && (
                        <span className="text-slate-400">
                          Answer: {question.answer}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VedaRank;
