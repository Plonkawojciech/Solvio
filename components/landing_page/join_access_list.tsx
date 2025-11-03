'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function JoinAccessList() {
    const [email, setEmail] = useState('')
    const router = useRouter()

    const handleClick = () => {
        if (!email) return
        router.push(`/sign-up?email=${encodeURIComponent(email)}`)
    }

    return (
        <div className="flex w-full max-w-md gap-2">
            <Input
                placeholder="Your e-mail"
                className="text-base h-12"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
            />
            <Button onClick={handleClick} size="lg" className="h-12 px-6">
                Sign Up
            </Button>
        </div>
    )
}