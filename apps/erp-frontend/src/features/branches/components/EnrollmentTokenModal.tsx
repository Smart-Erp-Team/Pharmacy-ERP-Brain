import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { toast } from 'react-toastify';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Skeleton } from '../../../components/ui/Skeleton';
import type { BranchDto, EnrollmentTokenDto } from '../../../types/api';

export interface EnrollmentTokenModalProps {
  open: boolean;
  branch: BranchDto | null;
  tokenData: EnrollmentTokenDto | null;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  onClose: () => void;
}

function formatRemainingTime(expiresAt: string, nowMs: number): string {
  const remainingMs = new Date(expiresAt).getTime() - nowMs;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return 'Expired';
  }
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s remaining`;
}

function TokenDisplay({ tokenData }: { tokenData: EnrollmentTokenDto }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [tokenData.enrollment_id]);

  const handleCopy = async () => {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(tokenData.token);
      setCopied(true);
      toast.success('Enrollment token copied to clipboard');
    } catch {
      const message =
        'Clipboard access was blocked. Select and copy the token manually.';
      setCopyError(message);
      toast.error(message);
    }
  };

  return (
    <>
      <Alert variant="warning" title="Single-use short-lived token">
        Share this token securely with the branch local terminal. It can be
        redeemed only once and will not be shown again after closing this
        dialog.
      </Alert>

      <div className="border-border bg-background flex items-center justify-between gap-3 rounded-md border p-3">
        <code className="text-body text-text font-mono break-all select-all">
          {tokenData.token}
        </code>
        <Button
          variant="secondary"
          onClick={handleCopy}
          leadingIcon={
            copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )
          }
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      {copyError ? <Alert variant="danger">{copyError}</Alert> : null}

      <div className="text-body-sm text-text-secondary flex flex-wrap items-center justify-between gap-2">
        <span>Expires: {new Date(tokenData.expires_at).toLocaleString()}</span>
        <span className="text-text font-mono font-medium">
          {formatRemainingTime(tokenData.expires_at, nowMs)}
        </span>
      </div>
    </>
  );
}

export function EnrollmentTokenModal({
  open,
  branch,
  tokenData,
  isLoading,
  errorMessage,
  onRetry,
  onClose,
}: EnrollmentTokenModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={branch ? `${branch.code} · ${branch.name}` : 'Branch device'}
      title="Branch enrollment token"
      icon={<KeyRound className="h-4 w-4" />}
      footer={
        <>
          {errorMessage ? (
            <Button variant="secondary" onClick={onRetry} isLoading={isLoading}>
              Retry
            </Button>
          ) : null}
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {isLoading ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : errorMessage ? (
          <Alert variant="danger" title="Could not generate enrollment token">
            {errorMessage}
          </Alert>
        ) : tokenData ? (
          <TokenDisplay key={tokenData.enrollment_id} tokenData={tokenData} />
        ) : null}
      </div>
    </Modal>
  );
}
