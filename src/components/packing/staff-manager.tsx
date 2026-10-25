"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pencil, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { InfoBanner } from "@/components/ui/info-banner";
import { EmptyRow } from "@/components/ui/table-parts";
import { fmtDate, fmtInt } from "@/lib/format";
import { ROLE_LABEL, type AppRole } from "@/lib/packing/types";
import { createStaff, updateStaff } from "@/app/actions/packing-staff";

export interface StaffRow {
  id: string;
  full_name: string;
  username: string;
  role: AppRole;
  is_active: boolean;
  created_at: string;
  today_count: number;
}

const ROLES: AppRole[] = ["petugas", "supervisor", "admin"];
const ROLE_HINT: Record<AppRole, string> = {
  petugas: "Rekam packing & lihat rekamannya sendiri",
  supervisor: "Lihat semua rekaman & ubah Pengaturan Packing",
  admin: "Semua menu, termasuk stock & kelola petugas",
};
const ROLE_TONE = { admin: "info", supervisor: "purple", petugas: "grey" } as const;

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        autoComplete="new-password"
        className="form-input pr-10"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        aria-label={show ? "Sembunyikan password" : "Lihat password"}
        className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-grey-1 hover:text-ink"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function RoleSelect({ value, onChange, disabled }: { value: AppRole; onChange: (r: AppRole) => void; disabled?: boolean }) {
  return (
    <>
      <select className="form-input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as AppRole)}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      <div className="form-hint">{ROLE_HINT[value]}</div>
    </>
  );
}

function AddStaffModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (info: { username: string; password: string; full_name: string }) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("petugas");
  const [saving, setSaving] = useState(false);

  const usernameOk = /^[a-z0-9._-]{3,30}$/.test(username);
  const valid = fullName.trim().length >= 2 && usernameOk && password.length >= 8;

  function reset() {
    setFullName("");
    setUsername("");
    setPassword("");
    setRole("petugas");
  }

  async function submit() {
    setSaving(true);
    const res = await createStaff({ full_name: fullName, username, password, role });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onCreated({ username, password, full_name: fullName.trim() });
    reset();
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Tambah Petugas"
      sub="Petugas login pakai username & password ini"
      size="sm"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Batal</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!valid}>
            Buat Akun
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="form-label">Nama</label>
          <input className="form-input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Mis. Budi Santoso" />
        </div>
        <div>
          <label className="form-label">Username</label>
          <input
            className={`form-input ${username && !usernameOk ? "error" : ""}`}
            value={username}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
            placeholder="mis. budi"
          />
          {username && !usernameOk ? (
            <div className="form-error">3–30 karakter: huruf kecil, angka, titik, _ atau -</div>
          ) : (
            <div className="form-hint">Dipakai untuk login</div>
          )}
        </div>
        <div>
          <label className="form-label">Password</label>
          <PasswordInput value={password} onChange={setPassword} placeholder="Minimal 8 karakter" />
          {password && password.length < 8 && <div className="form-error">Minimal 8 karakter</div>}
        </div>
        <div>
          <label className="form-label">Role</label>
          <RoleSelect value={role} onChange={setRole} />
        </div>
      </div>
    </Modal>
  );
}

function EditStaffModal({
  row,
  isSelf,
  onClose,
}: {
  row: StaffRow;
  isSelf: boolean;
  onClose: (changed: boolean) => void;
}) {
  const [fullName, setFullName] = useState(row.full_name);
  const [role, setRole] = useState<AppRole>(row.role);
  const [active, setActive] = useState(row.is_active);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const valid = fullName.trim().length >= 2 && (!password || password.length >= 8);

  async function submit() {
    setSaving(true);
    const res = await updateStaff({
      id: row.id,
      ...(fullName.trim() !== row.full_name && { full_name: fullName.trim() }),
      ...(role !== row.role && { role }),
      ...(active !== row.is_active && { is_active: active }),
      ...(password && { password }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(password ? `Akun ${row.username} diperbarui · password baru aktif` : `Akun ${row.username} diperbarui`);
    onClose(true);
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose(false)}
      title={`Ubah Akun · ${row.username}`}
      size="sm"
      footer={
        <>
          <Button onClick={() => onClose(false)}>Batal</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!valid}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="form-label">Nama</label>
          <input className="form-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Role</label>
          <RoleSelect value={role} onChange={setRole} disabled={isSelf} />
          {isSelf && <div className="form-hint">Role akun sendiri tidak bisa diubah</div>}
        </div>
        <div>
          <label className="form-label">Reset Password (opsional)</label>
          <PasswordInput value={password} onChange={setPassword} placeholder="Kosongkan kalau tidak diganti" />
          {password && password.length < 8 && <div className="form-error">Minimal 8 karakter</div>}
        </div>
        <label className="flex items-start gap-3 rounded-[10px] border border-line px-4 py-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-primary"
            checked={active}
            disabled={isSelf}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span>
            <span className="block text-[13px] font-semibold text-ink">Akun aktif</span>
            <span className="block text-[12px] text-grey-1">
              {isSelf ? "Akun sendiri tidak bisa dinonaktifkan" : "Kalau dimatikan, akun tidak bisa login. Rekamannya tetap tersimpan."}
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}

export function StaffManager({ rows, selfId, loadError }: { rows: StaffRow[]; selfId: string; loadError: string | null }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string; full_name: string } | null>(null);

  return (
    <>
      {created && (
        <InfoBanner variant="green" head={`Akun ${created.full_name} berhasil dibuat`}>
          Berikan info ini ke petugas: login di <strong>prettybasicops.vercel.app</strong> dengan username{" "}
          <strong>{created.username}</strong> dan password <strong>{created.password}</strong>. Password ini hanya ditampilkan
          sekali.{" "}
          <button type="button" className="cursor-pointer font-semibold text-pos-text underline" onClick={() => setCreated(null)}>
            Tutup
          </button>
        </InfoBanner>
      )}

      <Panel
        title="Daftar Akun"
        sub={`${fmtInt(rows.filter((r) => r.is_active).length)} aktif dari ${fmtInt(rows.length)} akun`}
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Tambah Petugas
          </Button>
        }
      >
        {loadError && <div className="mb-3 text-[12.5px] text-neg">Gagal memuat: {loadError}</div>}
        <table className="data-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Username</th>
              <th>Role</th>
              <th className="num">Paket Hari Ini</th>
              <th>Status</th>
              <th>Dibuat</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={7}>Belum ada akun.</EmptyRow>}
            {rows.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => setEditing(r)}>
                <td>
                  <span className="font-semibold text-ink">{r.full_name}</span>
                  {r.id === selfId && <span className="ml-1.5 text-[11.5px] text-grey-1">(Anda)</span>}
                </td>
                <td className="text-grey-1">{r.username}</td>
                <td>
                  <Badge tone={ROLE_TONE[r.role]}>{ROLE_LABEL[r.role]}</Badge>
                </td>
                <td className="num">{fmtInt(r.today_count)}</td>
                <td>{r.is_active ? <Badge tone="pos">Aktif</Badge> : <Badge tone="neg">Nonaktif</Badge>}</td>
                <td className="text-grey-1">{fmtDate(r.created_at)}</td>
                <td className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(r);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Ubah
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <AddStaffModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(info) => {
          setCreated(info);
          toast.success(`Akun ${info.username} dibuat`);
          router.refresh();
        }}
      />
      {editing && (
        <EditStaffModal
          key={editing.id}
          row={editing}
          isSelf={editing.id === selfId}
          onClose={(changed) => {
            setEditing(null);
            if (changed) router.refresh();
          }}
        />
      )}
    </>
  );
}
