import { Icon } from "@/ui/Icons";
import { logout } from "@/lib/admin/actions/auth";
import { adminNav } from "@/lib/admin/nav";

export const metadata = { title: "Menu" };

/* The phone's "More" tab: every section the role can open, plus the sites. */
export default async function More() {
  const { user, items } = await adminNav();
  return (
    <>
      <div className="row panel prox" style={{ display: "flex" }}>
        <div className="avatar" aria-hidden="true">{user.name[0]}</div>
        <div><b>{user.name}</b><div className="small dim">{user.email} · {user.role.toLowerCase()}</div></div>
      </div>
      <nav className="drawer-sites" aria-label="All sections">
        {items.map((i) => (
          <a key={i.href} href={i.href}>
            <Icon name={i.icon} />
            <span style={{ flex: 1 }}><b>{i.label.replace("Wholesale · ", "")}</b></span>
            {!!i.badge && <span className="badge">{i.badge}</span>}
          </a>
        ))}
      </nav>
      <nav className="drawer-sites" aria-label="Site">
        <a href="/" target="_blank" rel="noopener"><Icon name="box" /><b>View the Wholesale site</b></a>
      </nav>
      <form action={logout}><button className="btn" type="submit">Sign out</button></form>
    </>
  );
}
