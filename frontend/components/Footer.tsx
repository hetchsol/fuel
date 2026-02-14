export default function Footer() {
  return (
    <footer className="bg-footer-bg text-footer-text py-4 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center text-sm">
        <span>Fuel Management System</span>
        <span>&copy; {new Date().getFullYear()}</span>
      </div>
    </footer>
  )
}
