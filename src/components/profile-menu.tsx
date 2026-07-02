"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Field, TextInput } from "@/components/ui";
import { updateMyProfile, changeMyPassword } from "@/app/actions/profile";
import type { ProfileRow } from "@/lib/supabase/database.types";

type MeProfile = Pick<ProfileRow, "name" | "email" | "username" | "role">;

export function ProfileMenu({ profile }: { profile: MeProfile | null }) {
  const [open, setOpen] = useState(false);
  if (!profile) return null;

  const label = profile.name || profile.username || profile.email || "내 계정";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden rounded-md px-2 py-1 hover:bg-neutral-100 hover:text-neutral-800 sm:inline"
        title="내 정보 수정"
      >
        {label}
        {profile.role === "ADMIN" && " · 관리자"}
      </button>
      {open && <ProfileModal profile={profile} onClose={() => setOpen(false)} />}
    </>
  );
}

function ProfileModal({ profile, onClose }: { profile: MeProfile; onClose: () => void }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(profile.name ?? "");
  const [username, setUsername] = useState(profile.username ?? "");
  const [newPw, setNewPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [popup, setPopup] = useState<string | null>(null);

  // 포털 대상(document.body)은 클라이언트에서만 존재 + Esc 닫기
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function saveInfo() {
    setError(null);
    startTransition(async () => {
      const res = await updateMyProfile(name, username);
      if (res.ok) {
        setPopup("기본정보가 변경되었습니다");
        router.refresh();
      } else setError(res.error ?? "오류");
    });
  }

  function changePw() {
    setError(null);
    startTransition(async () => {
      const res = await changeMyPassword(newPw);
      if (res.ok) {
        setPopup("비밀번호가 변경되었습니다");
        setNewPw("");
      } else setError(res.error ?? "오류");
    });
  }

  if (!mounted) return null;

  return createPortal(
    <>
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-16 w-full max-w-sm rounded-xl border border-neutral-200 bg-white text-left shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="font-semibold text-neutral-900">내 정보 수정</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500">
            로그인 이메일{" "}
            <span className="font-medium text-neutral-700">{profile.email ?? "-"}</span>
            <span className="ml-1">(변경 불가)</span>
          </div>

          <Field label="이름">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="표시 이름" />
          </Field>
          <Field label="아이디(로그인)">
            <TextInput value={username} onChange={(e) => setUsername(e.target.value)} placeholder="로그인 아이디" />
          </Field>
          <button
            onClick={saveInfo}
            disabled={pending}
            className="w-full rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {pending ? "저장 중…" : "기본정보 저장"}
          </button>

          <div className="border-t border-neutral-200 pt-4">
            <Field label="비밀번호 변경 (4자 이상)">
              <div className="flex gap-2">
                <TextInput
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="새 비밀번호"
                />
                <button
                  onClick={changePw}
                  disabled={pending || newPw.length < 4}
                  className="shrink-0 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
                >
                  변경
                </button>
              </div>
            </Field>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </div>
    </div>

      {popup && (
        <div
          onClick={() => setPopup(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-2xl"
          >
            <div className="mb-2 text-4xl">✅</div>
            <p className="text-base font-semibold text-neutral-900">{popup}</p>
            <button
              onClick={() => setPopup(null)}
              className="mt-4 w-full rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
