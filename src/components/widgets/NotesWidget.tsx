"use client";

import { useState, useCallback } from "react";
import { useStore } from "@/store";
import { Plus, X, Edit3, Check } from "lucide-react";

const COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#e9d5ff"];

interface Note {
  id: string;
  text: string;
  color: string;
}

let noteCounter = 0;

interface NotesWidgetProps {
  id: string;
}

export function NotesWidget({ id }: NotesWidgetProps) {
  const widgets = useStore((s) => s.widgets);

  const widget = widgets.find((w) => w.id === id);
  const raw = (widget?.data?.notes as Note[]) ?? [];

  const [localNotes, setLocalNotes] = useState<Note[]>(raw);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [newText, setNewText] = useState("");

  const persist = useCallback(
    (notes: Note[]) => {
      const w = useStore.getState().widgets.find((w) => w.id === id);
      if (!w) return;
      useStore.setState((s) => ({
        widgets: s.widgets.map((wi) =>
          wi.id === id ? { ...wi, data: { ...wi.data, notes } } : wi,
        ),
      }));
    },
    [id],
  );

  const addNote = () => {
    const text = newText.trim();
    if (!text) return;
    const note: Note = {
      id: `note-${noteCounter++}`,
      text,
      color: COLORS[localNotes.length % COLORS.length],
    };
    const updated = [...localNotes, note];
    setLocalNotes(updated);
    persist(updated);
    setNewText("");
  };

  const deleteNote = (noteId: string) => {
    const updated = localNotes.filter((n) => n.id !== noteId);
    setLocalNotes(updated);
    persist(updated);
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditText(note.text);
  };

  const saveEdit = (noteId: string) => {
    const updated = localNotes.map((n) => (n.id === noteId ? { ...n, text: editText } : n));
    setLocalNotes(updated);
    persist(updated);
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-2" style={{ minHeight: 100 }}>
      <div className="flex gap-1">
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addNote()}
          placeholder="New note..."
          className="flex-1 px-2 py-1 text-[11px] font-body rounded-os outline-none border"
          style={{
            background: "var(--bg-primary)",
            color: "var(--text-primary)",
            borderColor: "var(--border)",
          }}
        />
        <button
          onClick={addNote}
          className="flex items-center justify-center w-6 h-6 rounded-os transition-opacity hover:opacity-80"
          style={{ background: "var(--accent-1)", color: "var(--bg-primary)" }}
          aria-label="Add note"
        >
          <Plus size={12} />
        </button>
      </div>

      {localNotes.length === 0 && (
        <p className="text-[10px] text-center py-3" style={{ color: "var(--text-secondary)" }}>
          No notes yet. Add one above.
        </p>
      )}

      <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto">
        {localNotes.map((note) => (
          <div
            key={note.id}
            className="group flex items-start gap-1 p-2 rounded-os text-xs leading-relaxed"
            style={{ background: note.color, color: "#1a1a1a" }}
          >
            {editingId === note.id ? (
              <div className="flex-1 flex gap-1">
                <input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="flex-1 px-1 py-0.5 text-xs rounded border border-black/20 outline-none"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && saveEdit(note.id)}
                />
                <button onClick={() => saveEdit(note.id)} className="shrink-0" aria-label="Save">
                  <Check size={12} />
                </button>
              </div>
            ) : (
              <>
                <span className="flex-1">{note.text}</span>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => startEdit(note)} aria-label="Edit note">
                    <Edit3 size={10} />
                  </button>
                  <button onClick={() => deleteNote(note.id)} aria-label="Delete note">
                    <X size={10} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
