import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { ILike, Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import {
  StudentEntity,
  toStudentResponseDTO
} from '../entities/students.entity'
import { CreateStudentDTO } from '../dto/student.dto.input'
import { hashPassword } from '../../utils/bcrypt'
import { ResponseStudentDTO } from '../dto/student.response.dto'
import { paginate, IPaginationOptions } from 'nestjs-typeorm-paginate'
import { PageDto } from '../../pageable/page.dto'
import { PageMetaDto } from '../../pageable/page-meta.dto'
import { ScholarshipService } from '../../scholarship/service/scholarship.service'
import { AdvisorService } from '../../advisor/service/advisor.service'
import { UpdateStudentDTO } from '../dto/update_student.dto'

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(StudentEntity)
    private studentRepository: Repository<StudentEntity>,
    private scholarshipService: ScholarshipService,
    private advisorService: AdvisorService
  ) {}

  async findAllStudents() {
    const students: StudentEntity[] = await this.studentRepository.find({
      relations: {
        articles: true,
        scolarship: true
      }
    })
    console.log(students[0])
    return students.map((student) => toStudentResponseDTO(student))
  }

  async findAllStudentsPaginate(options: IPaginationOptions) {
    const studentsPaginate = paginate<StudentEntity>(
      this.studentRepository,
      options,
      { relations: ['articles', 'scolarship'] }
    )
    const items = (await studentsPaginate).items
    const itemsDto = await items.map((student) => toStudentResponseDTO(student))
    const meta = (await studentsPaginate).meta
    const metaDto = new PageMetaDto(
      meta.totalItems,
      meta.itemCount,
      meta.itemsPerPage,
      meta.totalPages,
      meta.currentPage
    )

    return new PageDto(itemsDto, metaDto)
  }

  async findById(id: number) {
    const student = await this.studentRepository.findOne({
      relations: { articles: true, scolarship: true },
      loadEagerRelations: true,
      where: {
        id: id
      }
    })
    if (!student) throw new NotFoundException('Student not found')
    return toStudentResponseDTO(student)
  }

  async findByCourse(course: string): Promise<ResponseStudentDTO[]> {
    const students = await this.studentRepository.find({
      relations: { articles: true, scolarship: true },
      loadEagerRelations: true,
      where: { course: ILike(`%${course}%`) }
    })
    return students.map((student) => toStudentResponseDTO(student))
  }

  async findByEmail(email: string): Promise<ResponseStudentDTO> {
    const findStudent = await this.studentRepository.findOne({
      where: { email },
      relations: { articles: true, scolarship: true },
      loadEagerRelations: true
    })
    if (findStudent) return toStudentResponseDTO(findStudent)

    throw new NotFoundException('Student not found')
  }

  async findByAdvisorId(advisor_id: number): Promise<ResponseStudentDTO[]> {
    const students: StudentEntity[] = await this.studentRepository.find({
      where: { advisor_id },
      relations: { articles: true, scolarship: true },
      loadEagerRelations: true
    })
    return students.map((student) => toStudentResponseDTO(student))
  }

  async createStudent(student: CreateStudentDTO) {
    try {
      const haveEmailCadastred = await this.studentRepository.findOne({
        where: { email: student.email }
      })
      if (haveEmailCadastred) {
        throw new BadRequestException('Email already registered')
      }
      const advisor = await this.advisorService.findOneById(student.advisor_id)
      const advisorTaxIdEquals = advisor.tax_id === student.tax_id
      if (advisorTaxIdEquals) {
        throw new BadRequestException('Have Advisor Tax ID registered')
      }
      const haveTaxIdCadastred = await this.studentRepository.findOne({
        where: { tax_id: student.tax_id }
      })
      if (haveTaxIdCadastred) {
        throw new BadRequestException('Tax ID already registered')
      }
      const haveEnrollmentNumberCadastred =
        await this.studentRepository.findOne({
          where: { enrollment_number: student.enrollment_number }
        })
      if (haveEnrollmentNumberCadastred) {
        throw new BadRequestException('Enrollment Number already registered')
      }

      if (
        student.scholarship.scholarship_starts_at >=
        student.scholarship.scholarship_ends_at
      ) {
        throw new BadRequestException(
          'Scholarship start date must be before the end date'
        )
      }

      const passwordHash = await hashPassword(student.password)
      const newStudent = await this.studentRepository.create({
        ...student,
        password: passwordHash
      })
      const savedStudent = await this.studentRepository.save(newStudent)
      const toSaveScholarship = student.scholarship
      toSaveScholarship.student_id = savedStudent.id
      console.log(toSaveScholarship)
      await this.scholarshipService.create(toSaveScholarship)
    } catch (error) {
      throw new BadRequestException(error.message)
    }
  }

  async updatePassword(email: string, password: string) {
    const passwordHash = await hashPassword(password)
    await this.studentRepository.update({ email }, { password: passwordHash })
  }

  async updateStudent(student: UpdateStudentDTO) {
    if (student.password) {
      student.password = await hashPassword(student.password)
    }
    await this.studentRepository.update(
      { tax_id: student.tax_id },
      { ...student }
    )
  }
}
