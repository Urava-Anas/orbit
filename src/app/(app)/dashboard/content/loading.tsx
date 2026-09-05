import styles from "./ContentState.module.css";

export default function ContentEngineLoading() {
  return (
    <main className={styles.state} aria-busy="true" aria-label="Loading Content Engine">
      <div className={styles.skeleton}>
        <div className={styles.bar} />
        <div className={styles.row}><i /><i /><i /><i /></div>
        <div className={styles.block} />
        <div className={styles.block} />
      </div>
    </main>
  );
}
