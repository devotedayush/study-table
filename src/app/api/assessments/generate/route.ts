import { NextResponse } from 'next/server'
export async function POST() { return NextResponse.json({ error: 'This endpoint has moved to the Mocks & Assessments workspace.' }, { status: 410 }) }
