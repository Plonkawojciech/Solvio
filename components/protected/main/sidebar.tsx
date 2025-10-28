import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
    DollarSign,
    FileText,
    Home,
    Settings,
} from "lucide-react"

const items = [
    { label: "Dashboard", href: "/protected/dashboard", icon: Home },
    { label: "Expenses", href: "/protected/expenses", icon: DollarSign },
    { label: "Reports", href: "/protected/reports", icon: FileText },
    { label: "Settings", href: "/protected/settings", icon: Settings },
]

export function AppSidebar() {
    return (
        <Sidebar>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Main</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {items.map((item) => (
                                <SidebarMenuItem
                                    key={item.href}
                                >
                                    <SidebarMenuButton asChild>
                                        <a href={item.href}>
                                            <item.icon className="mr-2 h-4 w-4" />
                                            <span>{item.label}</span>
                                        </a>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
                <SidebarHeader>
                    <span className="text-lg font-bold">Solvio</span>
                </SidebarHeader>
            </SidebarFooter>
        </Sidebar>
    )
}