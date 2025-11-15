import { Bars3Icon } from '@heroicons/react/24/solid'
import { Link } from '@tanstack/react-router'
import type React from 'react'
import { useState } from 'react'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

export function Layout({
	children,
}: {
	children: React.ReactNode
}) {
	const [isSheetOpen, setIsSheetOpen] = useState(false)

	return (
		<div className='min-h-screen'>
			{/* Navbar */}
			<nav className='border-b bg-secondary'>
				<div className='flex h-16 items-center px-4'>
					{/* Mobile menu button */}
					<Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
						<SheetTrigger asChild>
							<Button
								variant='ghost'
								size='icon'
								className='lg:hidden'
								aria-label='open sidebar'
							>
								<Bars3Icon className='h-6 w-6' />
							</Button>
						</SheetTrigger>
						<SheetContent side='left' className='w-80'>
							<nav className='flex flex-col gap-4'>
								<Link
									to='/notes'
									className='text-lg font-medium hover:underline'
									onClick={() => setIsSheetOpen(false)}
								>
									Snippets
								</Link>
							</nav>
						</SheetContent>
					</Sheet>

					{/* Logo */}
					<div className='mx-2 flex-1 px-2'>
						<Link to='/' className='text-lg font-semibold hover:underline'>
							pocket-react
						</Link>
					</div>

					{/* Desktop menu */}
					<nav className='hidden lg:flex gap-4'>
						<Link
							to='/notes'
							className='text-sm font-medium hover:underline'
						>
							Notes
						</Link>
					</nav>
				</div>
			</nav>

			{/* Main content */}
			<main className='p-4'>{children}</main>
		</div>
	)
}