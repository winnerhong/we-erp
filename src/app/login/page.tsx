"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { publicSignUp, resolveLoginEmail } from "@/app/actions/auth";

const SAVE_KEY = "erp_saved_login";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 저장된 로그인 정보 불러오기 (마운트 후 — 클라이언트 전용 localStorage, 하이드레이션 불일치 방지)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as { email?: string; password?: string };
      /* eslint-disable react-hooks/set-state-in-effect */
      if (s.email) setEmail(s.email);
      if (s.password) setPassword(s.password);
      setRemember(true);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* ignore */
    }
  }, []);

  function persistCredentials() {
    try {
      if (remember) localStorage.setItem(SAVE_KEY, JSON.stringify({ email, password }));
      else localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }

  async function doLogin() {
    // 아이디(한글)로 입력 시 합성 이메일로 변환
    let loginEmail = email.trim();
    if (!loginEmail.includes("@")) {
      const r = await resolveLoginEmail(loginEmail);
      if (!r.email) {
        setError("아이디 또는 비밀번호가 올바르지 않습니다.");
        return;
      }
      loginEmail = r.email;
    }
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    if (error) {
      setError("아이디 또는 비밀번호가 올바르지 않습니다.");
      return;
    }
    persistCredentials();
    router.replace(search.get("next") || "/");
    router.refresh();
  }

  async function doSignup() {
    const res = await publicSignUp(email, password, name);
    if (!res.ok) {
      setError(res.error ?? "회원가입에 실패했습니다.");
      return;
    }
    // 가입 후 자동 로그인
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setInfo("가입 완료! 로그인 해주세요.");
      setMode("login");
      return;
    }
    persistCredentials();
    router.replace("/");
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    if (mode === "login") await doLogin();
    else await doSignup();
    setLoading(false);
  }

  const inputCls =
    "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";

  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-bold text-neutral-900">위너 통합 ERP</h1>

      <div className="mt-4 flex gap-1 rounded-lg bg-neutral-100 p-1 text-sm">
        {(["login", "signup"] as const).map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => {
              setMode(m);
              setError(null);
              setInfo(null);
            }}
            className={`flex-1 rounded-md py-1.5 font-medium ${mode === m ? "bg-white shadow-sm" : "text-neutral-500"}`}
          >
            {m === "login" ? "로그인" : "회원가입"}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {mode === "signup" && (
          <input
            type="text"
            placeholder="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        )}
        <input
          type={mode === "signup" ? "email" : "text"}
          required
          autoFocus
          placeholder={mode === "signup" ? "이메일" : "아이디 또는 이메일"}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
        />
        <input
          type="password"
          required
          placeholder={mode === "signup" ? "비밀번호 (6자 이상)" : "비밀번호"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
        />

        {mode === "login" && (
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            아이디·비밀번호 저장 (이 브라우저)
          </label>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-green-600">{info}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          {loading ? "처리 중…" : mode === "login" ? "로그인" : "회원가입"}
        </button>
      </div>

      {mode === "signup" && (
        <p className="mt-4 text-xs text-neutral-400">
          가입하면 ‘일반’ 권한으로 이용할 수 있습니다. 관리자 권한은 관리자가 부여합니다.
        </p>
      )}
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
