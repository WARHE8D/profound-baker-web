import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Input, Select, Textarea } from './controls'
import { Field } from './Field'

test('links the label and hint to the control', () => {
  render(
    <Field label="Name" hint="As on the order.">
      <Input />
    </Field>,
  )

  const input = screen.getByRole('textbox', { name: 'Name' })
  expect(input).toHaveAccessibleDescription('As on the order.')
  expect(input).not.toHaveAttribute('aria-invalid')
})

test('an error marks the control invalid and is part of its description', () => {
  render(
    <Field label="Email" hint="We only use it for this order." error="Enter a valid email.">
      <Input type="email" />
    </Field>,
  )

  const input = screen.getByRole('textbox', { name: 'Email' })
  expect(input).toBeInvalid()
  expect(input).toHaveAccessibleDescription('We only use it for this order. Enter a valid email.')
})

test('required is passed to the control; the asterisk is hidden from screen readers', () => {
  render(
    <Field label="Phone" required>
      <Input type="tel" />
    </Field>,
  )

  expect(screen.getByRole('textbox', { name: 'Phone' })).toBeRequired()
})

test('works for Textarea and Select too, and explicit props win', () => {
  render(
    <>
      <Field label="Notes">
        <Textarea />
      </Field>
      <Field label="Category" error="Pick one.">
        <Select aria-invalid={false}>
          <option>Bread</option>
        </Select>
      </Field>
    </>,
  )

  expect(screen.getByRole('textbox', { name: 'Notes' })).toBeInTheDocument()
  const select = screen.getByRole('combobox', { name: 'Category' })
  expect(select).toHaveAttribute('aria-invalid', 'false')
})

test('controls work without a Field', () => {
  render(<Input aria-label="Search" />)

  expect(screen.getByRole('textbox', { name: 'Search' })).toBeInTheDocument()
})
