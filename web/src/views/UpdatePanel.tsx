import { useState } from 'react';
import type { UpdateStatus } from '@kram/shared';
import { api, ApiError } from '../api/client.js';
import { useToast } from '../components/Toast.js';
import styles from './UpdatePanel.module.css';

/**
 * Checking is a network round-trip to the git remote, so it happens when the
 * user asks rather than on every render of the settings page. Nothing here
 * polls.
 */
export function UpdatePanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const toast = useToast();

  const check = async () => {
    setChecking(true);
    try {
      setStatus(await api.checkUpdates());
    } catch (error) {
      toast.show(error instanceof ApiError ? error.message : 'Could not check for updates', 'error');
    } finally {
      setChecking(false);
    }
  };

  const apply = async () => {
    setApplying(true);
    try {
      await api.applyUpdate();
      /*
       * Deliberately left in the applying state. The server is about to
       * rebuild and restart, so this tab will lose its connection within
       * seconds — resetting the button would invite a second click into a
       * server that is already going down.
       */
      toast.show('Update started — the app will restart in a minute or two', 'success');
    } catch (error) {
      toast.show(error instanceof ApiError ? error.message : 'Could not start the update', 'error');
      setApplying(false);
    }
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Updates</h2>

      {status === null ? (
        <p className={styles.description}>
          Check whether a newer version has been published.
        </p>
      ) : status.state === 'unknown' ? (
        <p className={styles.description}>
          <span className={styles.unknown}>Could not check.</span> {status.reason}
        </p>
      ) : status.state === 'up-to-date' ? (
        <p className={styles.description}>
          <span className={styles.current}>Up to date.</span>{' '}
          {status.current_subject ? (
            <>Running <code className={styles.sha}>{status.current.slice(0, 7)}</code> — {status.current_subject}</>
          ) : null}
        </p>
      ) : (
        <>
          <p className={styles.description}>
            <span className={styles.behind}>
              {/* behind_by is 0 when the new commits are not in the local object
                  store, which is the normal case: the check uses ls-remote and
                  never fetches. "An update is available" is true either way. */}
              {status.behind_by > 0
                ? `${status.behind_by} ${status.behind_by === 1 ? 'update' : 'updates'} available.`
                : 'An update is available.'}
            </span>
          </p>
          <ul className={styles.commits}>
            {status.commits.slice(0, 10).map((commit) => (
              <li key={commit.sha} className={styles.commit}>
                <code className={styles.sha}>{commit.sha.slice(0, 7)}</code>
                <span className={styles.subject}>{commit.subject}</span>
              </li>
            ))}
          </ul>
          {status.commits.length > 10 ? (
            <p className={styles.more}>…and {status.commits.length - 10} more</p>
          ) : null}
        </>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={check} disabled={checking || applying}>
          {checking ? 'Checking…' : 'Check for updates'}
        </button>

        {status?.state === 'behind' && status.can_apply ? (
          <button
            type="button"
            className={styles.primary}
            onClick={apply}
            disabled={applying}
          >
            {applying ? 'Updating…' : 'Update now'}
          </button>
        ) : null}
      </div>

      {/*
        * can_apply is false when kram-update.service is missing or polkit will
        * not let the app start it. Saying so, with the command that does work,
        * is more use than hiding the button and leaving no explanation.
        */}
      {status?.state === 'behind' && !status.can_apply ? (
        <p className={styles.hint}>
          This server cannot apply updates itself. Run{' '}
          <code className={styles.sha}>systemctl start kram-update</code> in the container.
        </p>
      ) : null}

      {applying ? (
        <p className={styles.hint}>
          The service is rebuilding and will restart. If this page stops responding, wait a minute
          and reload. If the new version fails to start, it rolls back on its own.
        </p>
      ) : null}
    </section>
  );
}
