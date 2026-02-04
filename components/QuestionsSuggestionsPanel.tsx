'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

type FeedbackItem = {
  id: number;
  type: string;
  content: string;
  response: string | null;
  created_at: string;
};

async function getFeedback(): Promise<{ feedback: FeedbackItem[] }> {
  const res = await fetch('/api/feedback');
  if (!res.ok) return { feedback: [] };
  return res.json();
}

type Tab = 'question' | 'suggestion';

type QuestionsSuggestionsPanelProps = {
  open?: boolean;
  onClose?: () => void;
};

export function QuestionsSuggestionsPanel({ open = true, onClose }: QuestionsSuggestionsPanelProps = {}) {
  const router = useRouter();
  const handleClose = () => (onClose ? onClose() : router.push('/dashboard'));
  const [tab, setTab] = useState<Tab>('question');
  const [questionInput, setQuestionInput] = useState('');
  const [suggestionInput, setSuggestionInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestionThankYou, setSuggestionThankYou] = useState(false);
  const queryClient = useQueryClient();

  const { data, refetch } = useQuery({
    queryKey: ['feedback'],
    queryFn: getFeedback,
    enabled: open,
  });

  const feedback = data?.feedback ?? [];
  const questions = feedback.filter((f) => f.type === 'question');
  const suggestions = feedback.filter((f) => f.type === 'suggestion');

  useEffect(() => {
    if (open) {
      refetch();
      setError(null);
      setSuggestionThankYou(false);
    }
  }, [open, refetch]);

  async function handleAsk() {
    const content = questionInput.trim();
    if (!content) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'question', content }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Failed to get answer');
      }
      setQuestionInput('');
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSuggestion() {
    const content = suggestionInput.trim();
    if (!content) return;
    setError(null);
    setSubmitting(true);
    setSuggestionThankYou(false);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'suggestion', content }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Failed to submit');
      }
      setSuggestionInput('');
      setSuggestionThankYou(true);
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={handleClose}>
      <div
        className="bg-white border border-slate-200 rounded-lg shadow-lg w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800 text-base">Questions and Suggestions</h2>
          <button type="button" onClick={handleClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => setTab('question')}
            className={'flex-1 py-2.5 text-sm font-medium ' + (tab === 'question' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-600 hover:bg-slate-50')}
          >
            Question
          </button>
          <button
            type="button"
            onClick={() => setTab('suggestion')}
            className={'flex-1 py-2.5 text-sm font-medium ' + (tab === 'suggestion' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-600 hover:bg-slate-50')}
          >
            Suggestion
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {tab === 'question' && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {questions.length === 0 && (
                  <p className="text-sm text-slate-500">Ask a question about the app or workflow. Answers are powered by AI.</p>
                )}
                {questions.map((q) => (
                  <div key={q.id} className="space-y-2">
                    <div className="bg-slate-100 rounded-lg p-3 text-sm text-slate-800">
                      <span className="font-medium text-slate-600 text-xs">You</span>
                      <p className="mt-0.5 whitespace-pre-wrap">{q.content}</p>
                      <p className="text-xs text-slate-500 mt-1">{new Date(q.created_at).toLocaleString()}</p>
                    </div>
                    {q.response && (
                      <div className="bg-blue-50 rounded-lg p-3 text-sm text-slate-800 border border-blue-100">
                        <span className="font-medium text-blue-700 text-xs">Answer</span>
                        <p className="mt-0.5 whitespace-pre-wrap">{q.response}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-slate-200">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={questionInput}
                    onChange={(e) => setQuestionInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAsk()}
                    placeholder="Type your question..."
                    className="flex-1 py-2 px-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={handleAsk}
                    disabled={submitting || !questionInput.trim()}
                    className="py-2 px-4 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Sending…' : 'Ask'}
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === 'suggestion' && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {suggestionThankYou && (
                  <p className="text-sm text-green-600 font-medium">Thank you for your suggestion. We will review it.</p>
                )}
                {suggestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-500">Your suggestions</p>
                    {suggestions.map((s) => (
                      <div key={s.id} className="bg-slate-100 rounded-lg p-3 text-sm text-slate-800">
                        <p className="whitespace-pre-wrap">{s.content}</p>
                        <p className="text-xs text-slate-500 mt-1">{new Date(s.created_at).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
                {suggestions.length === 0 && !suggestionThankYou && (
                  <p className="text-sm text-slate-500">Share an issue or suggestion. Your feedback helps us improve.</p>
                )}
              </div>
              <div className="p-4 border-t border-slate-200">
                <textarea
                  value={suggestionInput}
                  onChange={(e) => setSuggestionInput(e.target.value)}
                  placeholder="Describe your suggestion or issue..."
                  rows={3}
                  className="w-full py-2 px-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={handleSuggestion}
                  disabled={submitting || !suggestionInput.trim()}
                  className="mt-2 w-full py-2.5 px-4 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Submitting…' : 'Submit suggestion'}
                </button>
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default QuestionsSuggestionsPanel;
