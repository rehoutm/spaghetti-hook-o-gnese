// tests/fixtures/fat-effect.tsx
import { useEffect, useState } from "react";

export function Dashboard({ userId, region, locale, theme, currency }: any) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setLoading(true);
    if (userId) {
      if (region === "EU") {
        fetch(`/api/${userId}?r=${region}&l=${locale}`)
          .then((r) => r.json())
          .then((d) => {
            if (theme === "dark") setData({ ...d, theme });
            else setData(d);
            setLoading(false);
          })
          .catch((e) => {
            setErr(e);
            setLoading(false);
          });
      } else {
        setData(null);
        setLoading(false);
      }
    }
  }, [userId, region, locale, theme, currency]);

  return <div>{loading ? "..." : JSON.stringify(data)}</div>;
}
