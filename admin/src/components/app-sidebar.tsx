import {
  BookOpen,
  ChevronsUpDown,
  Flag,
  Inbox,
  Layers,
  LayoutDashboard,
  LogOut,
  Mic,
  ScrollText,
  Settings,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react"
import { NavLink, useLocation } from "react-router"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth"

type NavItem = { title: string; to: string; icon: LucideIcon }

export const NAV: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [{ title: "Dashboard", to: "/", icon: LayoutDashboard }] },
  {
    label: "Content",
    items: [
      { title: "Hymns", to: "/hymns", icon: BookOpen },
      { title: "Hymnals", to: "/hymnals", icon: Layers },
      { title: "Recordings", to: "/recordings", icon: Mic },
      { title: "Featured", to: "/featured", icon: Star },
    ],
  },
  {
    label: "Community",
    items: [
      { title: "Users", to: "/users", icon: Users },
      { title: "Composer requests", to: "/composer-requests", icon: Inbox },
      { title: "Reports", to: "/reports", icon: Flag },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Audit log", to: "/audit-log", icon: ScrollText },
      { title: "Settings", to: "/settings", icon: Settings },
    ],
  },
]

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function AppSidebar() {
  const { pathname } = useLocation()
  const { user, role, signOut } = useAuth()
  const name = user?.displayName ?? user?.email ?? "Admin"

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/">
                <img src="/exalto-mark.svg" alt="" className="size-7 shrink-0 object-contain" />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">Exalto Admin</span>
                  <span className="truncate text-xs text-muted-foreground">IDC Elgin</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to)
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <NavLink to={item.to}>
                        <item.icon />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <Avatar className="size-8">
                    {user?.photoURL && <AvatarImage src={user.photoURL} alt="" />}
                    <AvatarFallback>{initials(name)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate font-semibold">{name}</span>
                    <span className="truncate text-xs capitalize text-muted-foreground">{role}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
