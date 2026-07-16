import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentAPI } from '../../services/api';
import Sidebar from '../../components/layout/Sidebar';
import LoadingDots from '../../components/common/LoadingDots';

export default function Scores() {
    const [gradedAssignments, setGradedAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        fetchScores();
    }, []);

    async function fetchScores() {
        try {
            // The getAssignments endpoint automatically joins the student's
            // submissions and attaches `.score` if it has been graded.
            const response = await studentAPI.getAssignments();
            const allAssignments = response.data.assignments;

            // Filter to only show assignments that actually have a score
            const graded = allAssignments.filter(a => a.score !== undefined && a.score !== null);
            setGradedAssignments(graded);
        } catch (err) {
            setError('Failed to load scores');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-black flex">
            <Sidebar role="student" />

            <main className="flex-1 p-8 overflow-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8 page-enter">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        My Scores
                    </h1>
                </div>

                {error && (
                    <div
                        className="mb-6 p-4 rounded-lg border"
                        style={{
                            borderColor: 'var(--color-accent-error)',
                            background: 'rgba(255, 59, 48, 0.05)'
                        }}
                    >
                        <p className="text-sm" style={{ color: 'var(--color-accent-error)' }}>
                            {error}
                        </p>
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-20">
                        <LoadingDots text="Loading scores..." />
                    </div>
                ) : gradedAssignments.length === 0 ? (
                    <div className="card text-center py-16 page-enter">
                        <p className="text-[var(--color-text-secondary)]">
                            No graded assignments yet
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4 mb-12 page-stagger">
                        {gradedAssignments.map((assignment, index) => (
                            <div
                                key={assignment.id}
                                className="card"
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="status-dot status-submitted" />
                                        <h3 className="text-lg font-semibold">
                                            {assignment.title}
                                        </h3>
                                    </div>
                                    <span className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider">
                                        {assignment.type}
                                    </span>
                                </div>

                                <p className="text-sm text-[var(--color-text-secondary)] mb-4 line-clamp-2">
                                    {assignment.description}
                                </p>

                                <div className="flex flex-col sm:flex-row items-center justify-between border-t border-[var(--color-border)] pt-4 mt-4">
                                    <div className="flex items-center gap-4 text-sm text-[var(--color-text-secondary)]">
                                        <span>
                                            Evaluated for: {assignment.professorName || 'Professor'}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-3 mt-4 sm:mt-0">
                                        <div className="flex flex-col items-end">
                                            <span className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">
                                                Final Score
                                            </span>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-3xl font-light text-white">{assignment.score}</span>
                                                <span className="text-sm text-[var(--color-text-secondary)]">/ 10</span>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => navigate(`/student/assignments/${assignment.id}/view`)}
                                            className="btn-outline text-sm py-2 px-6 ml-4"
                                        >
                                            View Details
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
